import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  Plus,
  Search,
  Calendar,
  Dna,
  ArrowRight,
  X,
  AlertCircle,
  Loader2,
  Activity,
  Tag,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { Project } from '../../types';
import { bioService } from '../../services/bioService';
import { ProjectDetailView } from './ProjectDetailView';

interface ProjectsViewProps {
  user: any;
  onOpenAuth: () => void;
  onOpenWorkbench?: (
    sequence: string,
    metadata?: any,
    pipeline?: string,
    savedResults?: any,
    projectId?: string,
    sequenceId?: string
  ) => void;
  onOpenAiWithContext?: (context: any) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ user, onOpenAuth, onOpenWorkbench, onOpenAiWithContext }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Archived'>('All');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // New Project Form State
  const [name, setName] = useState<string>('');
  const [organism, setOrganism] = useState<string>('Homo sapiens');
  const [researchObjective, setResearchObjective] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [projectType, setProjectType] = useState<string>('Genomic Sequencing');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [user?.id]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await bioService.getProjects(user?.id);
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Project name is required.');
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const newProj = await bioService.createProject(user?.id, {
        name: cleanName,
        organism: organism.trim() || 'Homo sapiens',
        research_objective: researchObjective.trim(),
        description: description.trim(),
        project_type: projectType,
        tags
      });

      setProjects([newProj, ...projects]);
      setName('');
      setResearchObjective('');
      setDescription('');
      setTagsInput('');
      setIsModalOpen(false);

      // Automatically enter detail workspace of the created project
      setSelectedProjectId(newProj.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create project in Supabase.');
    } finally {
      setCreating(false);
    }
  };

  // Render detail view if a project is selected
  if (selectedProjectId) {
    return (
      <ProjectDetailView
        projectId={selectedProjectId}
        user={user}
        onBackToList={() => {
          setSelectedProjectId(null);
          loadProjects();
        }}
        onOpenWorkbench={onOpenWorkbench || (() => {})}
        onOpenAiWithContext={onOpenAiWithContext}
      />
    );
  }

  const safeProjects = Array.isArray(projects) ? projects : [];
  const filteredProjects = safeProjects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.organism && p.organism.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.research_objective && p.research_objective.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'All'
        ? true
        : statusFilter === 'Active'
        ? p.status !== 'Archived'
        : p.status === 'Archived';

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[#0284C7]" />
            <span>BioCode Research Projects</span>
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            Organize biological sequence datasets, mutation variants, and analysis runs into structured cloud workspaces.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Project</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name, organism, or objective..."
            className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setStatusFilter('All')}
            className={`px-3 py-1.5 rounded-lg font-mono transition-colors cursor-pointer ${
              statusFilter === 'All' ? 'bg-sky-50 text-[#0284C7] font-bold border border-sky-200' : 'bg-white text-[#64748B] hover:text-[#0F172A] border border-[#CBD5E1]'
            }`}
          >
            All ({safeProjects.length})
          </button>
          <button
            onClick={() => setStatusFilter('Active')}
            className={`px-3 py-1.5 rounded-lg font-mono transition-colors cursor-pointer ${
              statusFilter === 'Active' ? 'bg-sky-50 text-[#0284C7] font-bold border border-sky-200' : 'bg-white text-[#64748B] hover:text-[#0F172A] border border-[#CBD5E1]'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('Archived')}
            className={`px-3 py-1.5 rounded-lg font-mono transition-colors cursor-pointer ${
              statusFilter === 'Archived' ? 'bg-sky-50 text-[#0284C7] font-bold border border-sky-200' : 'bg-white text-[#64748B] hover:text-[#0F172A] border border-[#CBD5E1]'
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#0284C7] animate-spin mx-auto" />
          <p className="text-xs font-mono text-[#64748B]">Loading research workspaces from Supabase...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="p-16 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 shadow-xs">
          <FolderKanban className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h3 className="text-sm font-semibold text-[#0F172A]">No matching projects found</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            {searchQuery
              ? `No projects found matching "${searchQuery}".`
              : 'No research projects yet. Create your first project workspace to begin organizing sequences.'}
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-2 px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredProjects.map((project) => {
            const tags = Array.isArray(project.tags)
              ? project.tags
              : typeof project.tags === 'string'
              ? project.tags.split(',').map((t) => t.trim()).filter(Boolean)
              : [];

            return (
              <div
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="p-6 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#38BDF8] transition-all flex flex-col justify-between space-y-4 group shadow-xs hover:shadow-md cursor-pointer"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${
                        project.status === 'Archived'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {project.status || 'Active'}
                    </span>
                    <span className="text-xs font-mono text-[#64748B] flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[#0F172A] group-hover:text-[#0284C7] transition-colors">
                      {project.name}
                    </h3>
                    <p className="text-xs font-mono text-[#0284C7] italic mt-0.5">
                      {project.organism || 'Homo sapiens'}
                    </p>
                  </div>

                  {project.research_objective ? (
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155] leading-relaxed">
                      <span className="font-semibold text-[#0284C7] font-mono text-[10px] block uppercase tracking-wider mb-0.5">
                        Research Objective
                      </span>
                      {project.research_objective}
                    </div>
                  ) : project.description ? (
                    <p className="text-xs text-[#64748B] leading-relaxed line-clamp-2">{project.description}</p>
                  ) : null}

                  {tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {tags.slice(0, 4).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs font-mono text-[#64748B]">
                    <span className="flex items-center gap-1">
                      <Dna className="w-3.5 h-3.5 text-[#0284C7]" />
                      {project.sequencesCount || 0} seqs
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-emerald-600" />
                      {project.analysesCount || 0} runs
                    </span>
                  </div>

                  <span className="text-xs font-medium text-[#0284C7] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>Open Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-[#0284C7]" />
                Create New Bioinformatics Project
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#334155]">Project Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., GFP Mutational Thermostability Study"
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#334155]">Organism Reference</label>
                  <input
                    type="text"
                    value={organism}
                    onChange={(e) => setOrganism(e.target.value)}
                    placeholder="e.g., Aequorea victoria"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#334155]">Pipeline Type</label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] font-mono cursor-pointer"
                  >
                    <option value="Protein Engineering">Protein Engineering</option>
                    <option value="Genomic Sequencing">Genomic Sequencing</option>
                    <option value="RNA-Seq Transcriptome">RNA-Seq Transcriptome</option>
                    <option value="Variant Profiling">Variant Profiling</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#334155]">Research Objective</label>
                <input
                  type="text"
                  value={researchObjective}
                  onChange={(e) => setResearchObjective(e.target.value)}
                  placeholder="e.g., Evaluate S65T fluorescence shift and thermostability kinetics"
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#334155]">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., GFP, Mutation, Thermostability"
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#334155]">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the genomic objectives and experimental design..."
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Project Workspace</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
