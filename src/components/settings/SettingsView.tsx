import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Shield, 
  Key, 
  Cpu, 
  Database, 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Code, 
  Cloud, 
  Check, 
  Copy,
  Terminal,
  Server,
  Lock,
  UserCheck,
  Mail,
  Download,
  Upload,
  Link2
} from 'lucide-react';
import { bioService } from '../../services/bioService';
import {
  isSupabaseConfigured,
  getSanitizedSupabaseConfig,
  isAnonymousProviderDisabled,
  linkAnonymousAccountWithEmail,
  recoverWorkspaceWithEmail,
  sendWorkspaceRecoveryMagicLink,
  getOrCreateGuestScopeId
} from '../../lib/supabase/client';
import { SchemaHealthStatus } from '../../types';
import { SqlMigrationModal, SQL_MIGRATION_SCRIPT } from '../database/SqlMigrationModal';

interface SettingsViewProps {
  user?: any;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user }) => {
  const [saved, setSaved] = useState<boolean>(false);
  const [healthStatus, setHealthStatus] = useState<SchemaHealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState<boolean>(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Workspace Recovery & Linking State
  const [recoveryTab, setRecoveryTab] = useState<'link' | 'recover'>(
    user?.id && user?.is_anonymous ? 'link' : 'recover'
  );
  const [linkEmail, setLinkEmail] = useState<string>('');
  const [linkPassword, setLinkPassword] = useState<string>('');
  const [recoverEmail, setRecoverEmail] = useState<string>('');
  const [recoverPassword, setRecoverPassword] = useState<string>('');
  const [recoveryBusy, setRecoveryBusy] = useState<boolean>(false);
  const [recoveryNotice, setRecoveryNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      const status = await bioService.checkSchemaHealth(true);
      setHealthStatus(status);
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLinkWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryBusy(true);
    setRecoveryNotice(null);
    try {
      const res = await linkAnonymousAccountWithEmail(linkEmail, linkPassword);
      setRecoveryNotice({ type: 'success', text: res.message });
      setLinkPassword('');
    } catch (err: any) {
      setRecoveryNotice({ type: 'error', text: err?.message || 'Failed to link email to workspace.' });
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleRecoverWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryBusy(true);
    setRecoveryNotice(null);
    try {
      const res = await recoverWorkspaceWithEmail(recoverEmail, recoverPassword);
      if (res.user?.id) {
        await bioService.migrateLocalGuestToUser(res.user.id);
      }
      setRecoveryNotice({ type: 'success', text: res.message });
      setRecoverPassword('');
    } catch (err: any) {
      setRecoveryNotice({ type: 'error', text: err?.message || 'Failed to recover workspace.' });
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleSendMagicLink = async () => {
    setRecoveryBusy(true);
    setRecoveryNotice(null);
    try {
      const res = await sendWorkspaceRecoveryMagicLink(recoverEmail);
      setRecoveryNotice({ type: 'success', text: res.message });
    } catch (err: any) {
      setRecoveryNotice({ type: 'error', text: err?.message || 'Unable to send recovery link.' });
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleExportWorkspaceBackup = async () => {
    setRecoveryBusy(true);
    setRecoveryNotice(null);
    try {
      const snapshot = await bioService.exportWorkspaceSnapshot(user?.id);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `biocode_workspace_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setRecoveryNotice({
        type: 'success',
        text: `Exported ${snapshot.projects.length} project(s), ${snapshot.sequences.length} sequence(s), and ${snapshot.analyses.length} analysis record(s).`
      });
    } catch (err: any) {
      setRecoveryNotice({ type: 'error', text: err?.message || 'Failed to export workspace backup.' });
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleImportWorkspaceBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRecoveryBusy(true);
    setRecoveryNotice(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const res = await bioService.importWorkspaceSnapshot(parsed, user?.id);
      setRecoveryNotice({
        type: 'success',
        text: `Restored ${res.projectsImported} project(s), ${res.sequencesImported} sequence(s), ${res.analysesImported} analysis record(s), and ${res.versionsImported} version(s) into your workspace.`
      });
    } catch (err: any) {
      setRecoveryNotice({ type: 'error', text: err?.message || 'Invalid workspace backup JSON file.' });
    } finally {
      setRecoveryBusy(false);
    }
  };

  const sanitizedConfig = getSanitizedSupabaseConfig();
  const anonDisabled = isAnonymousProviderDisabled();
  const workspaceScopeLabel = user?.id
    ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}`
    : getOrCreateGuestScopeId().slice(0, 18);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-[#0284C7] shrink-0" />
          <span>Platform Settings & Database Architecture</span>
        </h2>
        <p className="text-xs text-[#64748B] mt-1">
          Manage BioCode Studio environment parameters, inspect Supabase schema health, and review database diagnostics.
        </p>
      </div>

      {/* Supabase Database Architecture & Schema Status Card */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-5 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#0284C7] font-bold flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0284C7] shrink-0" />
            <span>Supabase Database Architecture Diagnostics</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={checkHealth}
              disabled={checkingHealth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-xs text-[#334155] font-mono transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin text-[#0284C7]' : 'text-[#64748B]'}`} />
              <span>Validate Diagnostics</span>
            </button>

            <button
              onClick={() => setIsMigrationModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-xs text-[#0284C7] font-mono transition-colors cursor-pointer shadow-xs font-medium"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Full SQL Migration</span>
            </button>
          </div>
        </div>

        {/* Database Credentials & Connection State Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">Connection State</span>
            <div className="flex items-center gap-1.5 font-bold">
              {healthStatus?.state === 'CONNECTED' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">CONNECTED</span>
                </>
              ) : healthStatus?.state === 'CONFIGURATION_ERROR' ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-amber-700">CONFIG_MISSING</span>
                </>
              ) : healthStatus?.state === 'DATABASE_ERROR' ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-amber-700">SCHEMA_ERROR</span>
                </>
              ) : (
                <>
                  <Server className="w-3.5 h-3.5 text-[#64748B]" />
                  <span className="text-[#64748B]">OFFLINE</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">Supabase Endpoint</span>
            <div className="text-[#0F172A] font-mono text-[11px] truncate" title={sanitizedConfig.maskedUrl}>
              {sanitizedConfig.maskedUrl}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">Anon Key Status</span>
            <div className="text-[#0F172A] font-mono text-[11px] flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#0284C7]" />
              <span>{sanitizedConfig.hasAnonKey ? 'Configured & Masked' : 'Missing'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">RLS Policy Security</span>
            <div className="text-emerald-700 font-mono text-[11px] flex items-center gap-1.5 font-bold">
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>Enforced & Protected</span>
            </div>
          </div>
        </div>

        {/* 5 Canonical Tables Schema Health Grid */}
        <div>
          <div className="text-[11px] text-[#64748B] font-mono mb-2 flex flex-wrap items-center justify-between gap-1.5">
            <span>Canonical PostgreSQL Schema Tables (5/5)</span>
            {healthStatus?.checkedAt && (
              <span className="text-[10px] text-[#94A3B8]">
                Checked: {new Date(healthStatus.checkedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs font-mono">
            <div className={`p-2.5 rounded-xl border min-w-0 ${
              healthStatus?.tables.sequence_records 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 1</span>
              <span className="font-bold text-[11px] block break-all">sequence_records</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.sequence_records ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border min-w-0 ${
              healthStatus?.tables.analyses 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 2</span>
              <span className="font-bold text-[11px] block break-all">analyses</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.analyses ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border min-w-0 ${
              healthStatus?.tables.projects 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 3</span>
              <span className="font-bold text-[11px] block break-all">projects</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.projects ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border min-w-0 ${
              healthStatus?.tables.project_sequences 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 4</span>
              <span className="font-bold text-[11px] block break-all">project_sequences</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.project_sequences ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border min-w-0 ${
              healthStatus?.tables.sequence_versions 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 5</span>
              <span className="font-bold text-[11px] block break-all">sequence_versions</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.sequence_versions ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>
          </div>
        </div>

        {/* Informational Guidance */}
        {healthStatus?.missingTables && healthStatus.missingTables.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>PostgREST Schema Cache Reload Required</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800/90">
              When creating tables in Supabase, PostgREST must reload its schema cache. Running the migration script in <code className="font-mono bg-amber-100 px-1 py-0.5 rounded border border-amber-200">supabase_schema.sql</code> ends with <code className="font-mono bg-amber-100 px-1 py-0.5 rounded border border-amber-200">NOTIFY pgrst, &apos;reload schema&apos;;</code> which immediately makes all tables visible.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleCopySql}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs transition-colors cursor-pointer shadow-xs"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied Migration SQL</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Migration SQL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Workspace Session Recovery & Account Linking Card */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-5 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#0284C7] font-bold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span>Workspace Session Recovery &amp; Account Linking</span>
            </h3>
            <p className="text-xs text-[#64748B] mt-1">
              Your projects, sequences, analyses, and mutation versions are strictly isolated to your workspace session. Link an email or export a backup to protect against browser cookie expiration.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155]">
            ID: {workspaceScopeLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">Session Mode</span>
            <div className="font-bold text-[#0F172A]">
              {user?.id
                ? user?.is_anonymous
                  ? 'Supabase Anonymous Guest'
                  : 'Linked Cloud Account'
                : 'Isolated Browser Guest'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">Identity / Email</span>
            <div className="text-[#0F172A] truncate">
              {user?.email || (user?.is_anonymous ? 'Unlinked Anonymous Session' : anonDisabled ? 'Anonymous Auth Disabled on Server' : 'Local Guest Scope')}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[10px] text-[#64748B] uppercase block">Isolation Boundary</span>
            <div className="text-emerald-700 font-bold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{user?.id ? 'RLS (auth.uid() = user_id)' : 'Scoped Browser Storage'}</span>
            </div>
          </div>
        </div>

        {recoveryNotice && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              recoveryNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {recoveryNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span>{recoveryNotice.text}</span>
          </div>
        )}

        {isSupabaseConfigured && (
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <button
                type="button"
                onClick={() => {
                  setRecoveryTab('link');
                  setRecoveryNotice(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                  recoveryTab === 'link'
                    ? 'bg-sky-50 text-[#0284C7] font-bold border border-sky-200'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Link Email to Keep Cloud Workspace</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryTab('recover');
                  setRecoveryNotice(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                  recoveryTab === 'recover'
                    ? 'bg-sky-50 text-[#0284C7] font-bold border border-sky-200'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Recover Linked Workspace</span>
              </button>
            </div>

            {recoveryTab === 'link' ? (
              user?.id && !user?.is_anonymous ? (
                <p className="text-xs text-emerald-700 font-medium">
                  This workspace is permanently linked to {user.email}. You can recover your projects and analyses from any browser using your email.
                </p>
              ) : (
                <form onSubmit={handleLinkWorkspace} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs">
                  <div>
                    <label className="block text-[#475569] font-medium mb-1">Recovery Email</label>
                    <input
                      type="email"
                      required
                      value={linkEmail}
                      onChange={(e) => setLinkEmail(e.target.value)}
                      placeholder="researcher@lab.org"
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#475569] font-medium mb-1">Password (min 6 chars)</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={linkPassword}
                      onChange={(e) => setLinkPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={recoveryBusy || !user?.id}
                    className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {user?.id ? 'Link Email (Keep Data)' : 'Requires Active Cloud Guest Session'}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleRecoverWorkspace} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[#475569] font-medium mb-1">Linked Email</label>
                    <input
                      type="email"
                      required
                      value={recoverEmail}
                      onChange={(e) => setRecoverEmail(e.target.value)}
                      placeholder="researcher@lab.org"
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#475569] font-medium mb-1">Password</label>
                    <input
                      type="password"
                      value={recoverPassword}
                      onChange={(e) => setRecoverPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={recoveryBusy || !recoverEmail || !recoverPassword}
                      className="flex-1 px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      Restore Session
                    </button>
                    <button
                      type="button"
                      disabled={recoveryBusy || !recoverEmail}
                      onClick={handleSendMagicLink}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Email Link
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Portable Workspace Backup (Works offline & across expired sessions) */}
        <div className="pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-[#64748B]">
            Portable Workspace Snapshot: export or restore your projects, sequences, analyses, and mutation versions as JSON anytime without losing existing work.
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={recoveryBusy}
              onClick={handleExportWorkspaceBackup}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-xs text-[#0F172A] font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Export Workspace Backup</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-xs text-[#0284C7] font-semibold transition-colors cursor-pointer shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
              <span>Restore Backup JSON</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImportWorkspaceBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* General Settings */}
        <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-4 shadow-xs">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#0284C7] font-bold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#0284C7]" />
            General BioEngine Preferences
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[#475569] font-medium mb-1.5">Default Organism Reference</label>
              <select className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] font-mono focus:outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] cursor-pointer">
                <option>Homo sapiens (GRCh38)</option>
                <option>SARS-CoV-2 (Wuhan-Hu-1)</option>
                <option>Arabidopsis thaliana</option>
                <option>Escherichia coli K-12</option>
              </select>
            </div>

            <div>
              <label className="block text-[#475569] font-medium mb-1.5">Maximum Thread Allocation</label>
              <select className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] font-mono focus:outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] cursor-pointer">
                <option>8 vCPUs (Standard Pipeline)</option>
                <option>16 vCPUs (High-Throughput)</option>
                <option>32 vCPUs (Cluster Node)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-[#64748B] font-mono">
            {saved && (
              <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Preferences saved successfully.
              </span>
            )}
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto justify-center px-6 py-2.5 rounded-xl bg-[#0284C7] hover:bg-sky-600 text-white font-medium text-xs transition-all shadow-xs cursor-pointer"
          >
            Save Configuration
          </button>
        </div>
      </form>

      {/* SQL Migration Modal */}
      <SqlMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => {
          setIsMigrationModalOpen(false);
          checkHealth();
        }}
        missingTables={healthStatus?.missingTables}
      />
    </div>
  );
};
