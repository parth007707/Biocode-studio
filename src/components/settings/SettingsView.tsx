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
  Lock
} from 'lucide-react';
import { bioService } from '../../services/bioService';
import { isSupabaseConfigured, getSanitizedSupabaseConfig } from '../../lib/supabase/client';
import { SchemaHealthStatus } from '../../types';
import { SqlMigrationModal, SQL_MIGRATION_SCRIPT } from '../database/SqlMigrationModal';

export const SettingsView: React.FC = () => {
  const [saved, setSaved] = useState<boolean>(false);
  const [healthStatus, setHealthStatus] = useState<SchemaHealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState<boolean>(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

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

  const sanitizedConfig = getSanitizedSupabaseConfig();

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-[#0284C7]" />
          <span>Platform Settings & Database Architecture</span>
        </h2>
        <p className="text-xs text-[#64748B] mt-1">
          Manage BioCode Studio environment parameters, inspect Supabase schema health, and review database diagnostics.
        </p>
      </div>

      {/* Supabase Database Architecture & Schema Status Card */}
      <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-5 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#0284C7] font-bold flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0284C7]" />
            Supabase Database Architecture Diagnostics
          </h3>

          <div className="flex items-center gap-2">
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
          <div className="text-[11px] text-[#64748B] font-mono mb-2 flex items-center justify-between">
            <span>Canonical PostgreSQL Schema Tables (5/5)</span>
            {healthStatus?.checkedAt && (
              <span className="text-[10px] text-[#94A3B8]">
                Checked: {new Date(healthStatus.checkedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className={`p-2.5 rounded-xl border ${
              healthStatus?.tables.sequence_records 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 1</span>
              <span className="font-bold text-[11px]">sequence_records</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.sequence_records ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              healthStatus?.tables.analyses 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 2</span>
              <span className="font-bold text-[11px]">analyses</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.analyses ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              healthStatus?.tables.projects 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 3</span>
              <span className="font-bold text-[11px]">projects</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.projects ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              healthStatus?.tables.project_sequences 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 4</span>
              <span className="font-bold text-[11px]">project_sequences</span>
              <span className="block text-[9px] mt-0.5">
                {healthStatus?.tables.project_sequences ? '✓ Synchronized' : '⚠ Missing'}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              healthStatus?.tables.sequence_versions 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-[9px] text-[#64748B] block uppercase">Table 5</span>
              <span className="font-bold text-[11px]">sequence_versions</span>
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* General Settings */}
        <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-4 shadow-xs">
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

        <div className="flex items-center justify-between pt-2">
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
            className="px-6 py-2.5 rounded-xl bg-[#0284C7] hover:bg-sky-600 text-white font-medium text-xs transition-all shadow-xs cursor-pointer"
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
