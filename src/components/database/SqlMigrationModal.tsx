import React, { useState } from 'react';
import { Database, Copy, Check, X, Terminal, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';

interface SqlMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingTables?: string[];
}

export const SQL_MIGRATION_SCRIPT = `-- ============================================================================
-- BioCode Studio - Supabase Complete Database Schema & RLS Policies
-- Execute this entire script in your Supabase SQL Editor.
-- ============================================================================

-- Ensure uuid-ossp or pgcrypto extension is available for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

-- Drop existing policies to prevent conflicts on re-runs
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 2. PROJECTS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  name text not null,
  organism text default 'Homo sapiens',
  description text,
  research_objective text,
  tags jsonb default '[]'::jsonb,
  project_type text default 'Genomic Analysis',
  status text check (status in ('Active', 'Archived', 'Processing')) default 'Active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.projects add column if not exists research_objective text;
alter table public.projects add column if not exists tags jsonb default '[]'::jsonb;

alter table public.projects enable row level security;

drop policy if exists "Users can view their own projects" on public.projects;
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;

create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 3. SEQUENCE_RECORDS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.sequence_records (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source text default 'Direct Input',
  accession text not null,
  version text,
  organism text default 'Homo sapiens',
  molecule_type text,
  sequence_type text default 'Genomic DNA',
  definition text,
  total_length integer default 0,
  topology text default 'linear',
  sequence text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.sequence_records add column if not exists project_id uuid references public.projects(id) on delete set null;

-- Indexes for high performance searches & lookups
create index if not exists idx_sequence_records_user_id on public.sequence_records(user_id);
create index if not exists idx_sequence_records_project_id on public.sequence_records(project_id);
create index if not exists idx_sequence_records_accession on public.sequence_records(accession);
create index if not exists idx_sequence_records_created_at on public.sequence_records(created_at desc);

alter table public.sequence_records enable row level security;

drop policy if exists "Users can view sequence records" on public.sequence_records;
drop policy if exists "Users can insert sequence records" on public.sequence_records;
drop policy if exists "Users can update sequence records" on public.sequence_records;
drop policy if exists "Users can delete sequence records" on public.sequence_records;

create policy "Users can view sequence records"
  on public.sequence_records for select
  using (auth.uid() = user_id);

create policy "Users can insert sequence records"
  on public.sequence_records for insert
  with check (auth.uid() = user_id);

create policy "Users can update sequence records"
  on public.sequence_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete sequence records"
  on public.sequence_records for delete
  using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 3b. PROJECT_SEQUENCES JUNCTION TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.project_sequences (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  sequence_id uuid references public.sequence_records(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint project_sequences_project_id_sequence_id_key unique (project_id, sequence_id)
);

create index if not exists idx_project_sequences_project_id on public.project_sequences(project_id);
create index if not exists idx_project_sequences_sequence_id on public.project_sequences(sequence_id);
create index if not exists idx_project_sequences_user_id on public.project_sequences(user_id);

alter table public.project_sequences enable row level security;

drop policy if exists "Users can view project sequences" on public.project_sequences;
drop policy if exists "Users can insert project sequences" on public.project_sequences;
drop policy if exists "Users can update project sequences" on public.project_sequences;
drop policy if exists "Users can delete project sequences" on public.project_sequences;

create policy "Users can view project sequences"
  on public.project_sequences for select
  using (auth.uid() = user_id);

create policy "Users can insert project sequences"
  on public.project_sequences for insert
  with check (auth.uid() = user_id);

create policy "Users can update project sequences"
  on public.project_sequences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete project sequences"
  on public.project_sequences for delete
  using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 4. ANALYSES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  sequence_id uuid references public.sequence_records(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  analysis_type text not null,
  analysis_scope text default 'Complete Sequence',
  total_sequence_length integer default 0,
  analyzed_length integer default 0,
  sequence_type text default 'DNA',
  input_source text default 'Manual Input',
  status text check (status in ('Completed', 'Pending', 'Failed')) default 'Completed',
  result_summary text default null,
  results jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- If analyses table previously existed without the new columns, ensure columns exist
alter table public.analyses add column if not exists sequence_id uuid references public.sequence_records(id) on delete set null;
alter table public.analyses add column if not exists analysis_scope text default 'Complete Sequence';
alter table public.analyses add column if not exists total_sequence_length integer default 0;
alter table public.analyses add column if not exists analyzed_length integer default 0;
alter table public.analyses add column if not exists sequence_length integer default 0;
alter table public.analyses add column if not exists results jsonb default '{}'::jsonb;

-- Indexes for fast audit log and relation queries
create index if not exists idx_analyses_user_id on public.analyses(user_id);
create index if not exists idx_analyses_sequence_id on public.analyses(sequence_id);
create index if not exists idx_analyses_project_id on public.analyses(project_id);
create index if not exists idx_analyses_created_at on public.analyses(created_at desc);

alter table public.analyses enable row level security;

drop policy if exists "Users can view their own analyses" on public.analyses;
drop policy if exists "Users can insert their own analyses" on public.analyses;
drop policy if exists "Users can update their own analyses" on public.analyses;
drop policy if exists "Users can delete their own analyses" on public.analyses;

create policy "Users can view their own analyses"
  on public.analyses for select
  using (auth.uid() = user_id);

create policy "Users can insert their own analyses"
  on public.analyses for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own analyses"
  on public.analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own analyses"
  on public.analyses for delete
  using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 5. SEQUENCE_VERSIONS TABLE (Mutation Tracking & Draft History)
-- ----------------------------------------------------------------------------
create table if not exists public.sequence_versions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  sequence_id uuid references public.sequence_records(id) on delete cascade,
  sequence_record_id uuid references public.sequence_records(id) on delete cascade,
  parent_version_id uuid references public.sequence_versions(id) on delete set null,
  accession text,
  original_sequence text,
  modified_sequence text,
  sequence_data text not null,
  version_number integer not null default 1,
  mutation_summary jsonb default '{}'::jsonb,
  changes jsonb default '[]'::jsonb,
  change_type text default 'modification',
  original_length bigint not null default 0,
  modified_length bigint not null default 0,
  total_changes integer default 0,
  status text check (status in ('Completed', 'Pending', 'Draft', 'Failed')) default 'Completed',
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure backward/forward compatible columns if table exists
alter table public.sequence_versions add column if not exists user_id uuid references auth.users on delete cascade;
alter table public.sequence_versions add column if not exists sequence_id uuid references public.sequence_records(id) on delete cascade;
alter table public.sequence_versions add column if not exists sequence_record_id uuid references public.sequence_records(id) on delete cascade;
alter table public.sequence_versions add column if not exists parent_version_id uuid references public.sequence_versions(id) on delete set null;
alter table public.sequence_versions add column if not exists accession text;
alter table public.sequence_versions add column if not exists original_sequence text;
alter table public.sequence_versions add column if not exists modified_sequence text;
alter table public.sequence_versions add column if not exists mutation_summary jsonb default '{}'::jsonb;
alter table public.sequence_versions add column if not exists change_type text default 'modification';

-- Indexes for sequence versioning performance
create index if not exists idx_sequence_versions_user_id on public.sequence_versions(user_id);
create index if not exists idx_sequence_versions_sequence_id on public.sequence_versions(sequence_id);
create index if not exists idx_sequence_versions_record_id on public.sequence_versions(sequence_record_id);
create index if not exists idx_sequence_versions_parent_id on public.sequence_versions(parent_version_id);
create index if not exists idx_sequence_versions_version_num on public.sequence_versions(version_number);
create index if not exists idx_sequence_versions_created_at on public.sequence_versions(created_at desc);

alter table public.sequence_versions enable row level security;

drop policy if exists "Users can view sequence versions" on public.sequence_versions;
drop policy if exists "Users can insert sequence versions" on public.sequence_versions;
drop policy if exists "Users can update sequence versions" on public.sequence_versions;
drop policy if exists "Users can delete sequence versions" on public.sequence_versions;

create policy "Users can view sequence versions"
  on public.sequence_versions for select
  using (auth.uid() = user_id);

create policy "Users can insert sequence versions"
  on public.sequence_versions for insert
  with check (auth.uid() = user_id);

create policy "Users can update sequence versions"
  on public.sequence_versions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete sequence versions"
  on public.sequence_versions for delete
  using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 6. RELOAD POSTGREST SCHEMA CACHE
-- ----------------------------------------------------------------------------
-- This critical command notifies PostgREST to instantly reload its schema cache
-- so newly created tables (analyses, sequence_records, sequence_versions) are immediately recognized.
notify pgrst, 'reload schema';
`;

export const SqlMigrationModal: React.FC<SqlMigrationModalProps> = ({
  isOpen,
  onClose,
  missingTables
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-3xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E2E8F0] flex items-center justify-between gap-2 bg-[#F8FAFC] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-[rgba(56,189,248,0.12)] border border-[#38BDF8]/30 text-[#0284C7] shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#0F172A] tracking-tight flex flex-wrap items-center gap-2">
                <span>Supabase SQL Migration Script</span>
                <span className="text-[10px] bg-[rgba(56,189,248,0.12)] text-[#0284C7] border border-[#38BDF8]/30 px-2 py-0.5 rounded font-mono">
                  Schema v2.0
                </span>
              </h3>
              <p className="text-xs text-[#64748B]">
                Execute in your Supabase SQL Editor to provision persistent <code className="font-mono text-[#0284C7]">sequence_records</code> and <code className="font-mono text-[#0284C7]">analyses</code> tables.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Guidance Notice */}
        <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] space-y-2 text-xs">
          {missingTables && missingTables.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Missing from PostgREST cache: {missingTables.join(', ')}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px] text-[#475569]">
            <div className="bg-white p-2.5 rounded-lg border border-[#E2E8F0] flex items-center gap-2 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-[#F1F5F9] flex items-center justify-center font-bold text-[#0284C7]">1</span>
              <span>Open Supabase SQL Editor</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-[#E2E8F0] flex items-center gap-2 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-[#F1F5F9] flex items-center justify-center font-bold text-[#0284C7]">2</span>
              <span>Paste & Click "RUN"</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-[#E2E8F0] flex items-center gap-2 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-[#F1F5F9] flex items-center justify-center font-bold text-[#0284C7]">3</span>
              <span>PostgREST reloads cache</span>
            </div>
          </div>
        </div>

        {/* Code Content */}
        <div className="flex-1 p-4 overflow-y-auto bg-[#0F172A] font-mono text-xs text-slate-300 leading-relaxed relative">
          <pre className="whitespace-pre overflow-x-auto text-[11px] text-emerald-300/90 selection:bg-emerald-500 selection:text-black">
            {SQL_MIGRATION_SCRIPT}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-mono">
            <Terminal className="w-4 h-4 text-[#0284C7] shrink-0" />
            <span>Includes RLS policies, indexing & PostgREST notify</span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            <button
              onClick={onClose}
              className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#334155] text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy SQL Migration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
