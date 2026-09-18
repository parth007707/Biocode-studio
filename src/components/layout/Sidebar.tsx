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
  ShieldCheck,
  ChevronRight
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
    <aside className="w-[260px] bg-[#F0F9FF] border-r border-[#BAE6FD] flex flex-col h-screen select-none shrink-0 z-20 overflow-hidden shadow-[0_4px_20px_rgba(14,165,233,0.06)]">
      {/* Brand Logo */}
      <div className="p-5 flex items-center space-x-3 border-b border-[#BAE6FD] bg-white/70 backdrop-blur-xs">
        <div className="w-8 h-8 bg-[#E0F2FE] border border-[#7DD3FC] rounded-lg flex items-center justify-center text-[#0284C7] shadow-[0_0_15px_rgba(14,165,233,0.2)] shrink-0">
          <Dna className="w-5 h-5 text-[#0284C7]" />
        </div>
        <span className="text-lg font-bold tracking-tight text-[#0F172A] truncate">
          BioCode <span className="text-[#0284C7]">Studio</span>
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3.5 py-4 space-y-1.5 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          // Color coded active identity for each section
          const getActiveClasses = () => {
            switch (item.id) {
              case 'ai-assistant':
                return 'bg-[#FDF2F8] text-[#BE185D] font-semibold border-l-4 border-l-[#EC4899] border-y border-r border-[#F9A8D4] shadow-xs';
              case 'projects':
                return 'bg-[#F5F3FF] text-[#6D28D9] font-semibold border-l-4 border-l-[#8B5CF6] border-y border-r border-[#DDD6FE] shadow-xs';
              case 'history':
                return 'bg-[#FFF7ED] text-[#C2410C] font-semibold border-l-4 border-l-[#F97316] border-y border-r border-[#FED7AA] shadow-xs';
              case 'settings':
                return 'bg-[#F1F5F9] text-[#334155] font-semibold border-l-4 border-l-[#64748B] border-y border-r border-[#CBD5E1] shadow-xs';
              case 'dashboard':
              case 'analysis':
              default:
                return 'bg-[#E0F2FE] text-[#0369A1] font-semibold border-l-4 border-l-[#0284C7] border-y border-r border-[#7DD3FC] shadow-xs';
            }
          };

          const getIconColor = () => {
            if (!isActive) return 'text-[#64748B] group-hover:text-[#0F172A]';
            switch (item.id) {
              case 'ai-assistant': return 'text-[#EC4899]';
              case 'projects': return 'text-[#8B5CF6]';
              case 'history': return 'text-[#F97316]';
              case 'settings': return 'text-[#475569]';
              default: return 'text-[#0284C7]';
            }
          };

          const getChevronColor = () => {
            switch (item.id) {
              case 'ai-assistant': return 'text-[#EC4899]';
              case 'projects': return 'text-[#8B5CF6]';
              case 'history': return 'text-[#F97316]';
              default: return 'text-[#0284C7]';
            }
          };

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer group relative ${
                isActive
                  ? getActiveClasses()
                  : 'text-[#475569] hover:bg-white/80 hover:text-[#0F172A] border border-transparent'
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
                        ? 'bg-[#FDF2F8] text-[#EC4899] border border-[#F9A8D4]'
                        : isActive
                        ? 'bg-[#E0F2FE] text-[#0284C7] border border-[#7DD3FC]'
                        : 'bg-white text-[#64748B] border border-[#BAE6FD]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight className={`w-3.5 h-3.5 ${getChevronColor()}`} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer System Status Card */}
      <div className="p-3.5 border-t border-[#BAE6FD] bg-white/70 backdrop-blur-xs">
        <div className="rounded-xl p-3 bg-white border border-[#BAE6FD] space-y-2 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#64748B] flex items-center gap-1.5 font-mono">
              <Cpu className="w-3.5 h-3.5 text-[#0284C7]" />
              Engine Status
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#16A34A] font-semibold bg-[#F0FDF4] px-1.5 py-0.5 rounded border border-[#BBF7D0]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              Operational
            </span>
          </div>
          <div className="text-[11px] text-[#64748B] flex items-center justify-between pt-1.5 border-t border-[#E2E8F0] font-mono">
            <span>Platform:</span>
            <span className="text-[#0284C7] font-semibold">Research Station</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
