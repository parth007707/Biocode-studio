import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Dna,
  Activity,
  GitBranch,
  Plus,
  Edit,
  Archive,
  Trash2,
  Tag,
  Search,
  Loader2,
  ChevronRight,
  FileText,
  AlertCircle,
  Sparkles,
  Database
} from 'lucide-react';
import { Project, SequenceRecord, AnalysisRecord } from '../../types';
import { bioService } from '../../services/bioService';
import { AddSequenceModal } from './AddSequenceModal';
import { EditProjectModal } from './EditProjectModal';

interface ProjectDetailViewProps {
  projectId: string;
  user: any;
  onBackToList: () => void;
  onOpenWorkbench: (
    sequence: string,
    metadata?: any,
    pipeline?: string,
    savedResults?: any,
    projectId?: string,
    sequenceId?: string
  ) => void;
  onOpenAiWithContext?: (context: any) => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  projectId,
  user,
  onBackToList,
  onOpenWorkbench,
  onOpenAiWithContext
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [sequences, setSequences] = useState<SequenceRecord[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sequences' | 'analyses' | 'versions' | 'activity'>('overview');

  // Modals
  const [isAddSeqModalOpen, setIsAddSeqModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Search filter inside tabs
  const [seqSearch, setSeqSearch] = useState<string>('');
  const [anaSearch, setAnaSearch] = useState<string>('');

  useEffect(() => {
    loadProjectData();
  }, [projectId, user?.id]);

  const loadProjectData = async () => {
    setLoading(true);
    try {
      const [proj, seqs, anas, vers, acts] = await Promise.all([
        bioService.getProjectById(projectId, user?.id),
        bioService.getProjectSequences(projectId, user?.id),
        bioService.getProjectAnalyses(projectId, user?.id),
        bioService.getProjectVersions(projectId, user?.id),
        bioService.getProjectActivities(projectId, user?.id)
      ]);

      setProject(proj);
      setSequences(Array.isArray(seqs) ? seqs : []);
      setAnalyses(Array.isArray(anas) ? anas : []);
      setVersions(Array.isArray(vers) ? vers : []);
      setActivities(Array.isArray(acts) ? acts : []);
    } catch (err) {
      console.error('[ProjectDetailView] Error loading project data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveProject = async () => {
    if (!project) return;
    if (!window.confirm(`Are you sure you want to archive "${project.name}"?`)) return;

    try {
      const updated = await bioService.archiveProject(project.id, user?.id);
      setProject(updated);
      setActionMsg('Project archived successfully.');
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err: any) {
      setActionMsg(err.message || 'Failed to archive project.');
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleRemoveSequence = async (seqId: string, accession: string) => {
    if (!project) return;
    if (!window.confirm(`Remove sequence ${accession} from project "${project.name}"? (Sequence will not be deleted from database)`)) return;

    try {
      await bioService.removeSequenceFromProject(project.id, seqId, user?.id);
      setActionMsg(`Sequence ${accession} removed from project.`);
      setTimeout(() => setActionMsg(null), 3000);
      loadProjectData();
    } catch (err: any) {
      setActionMsg(err.message || 'Failed to remove sequence.');
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="py-32 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#0284C7] animate-spin mx-auto" />
        <p className="text-xs font-mono text-[#64748B]">Loading research project from Supabase...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <button
          onClick={onBackToList}
          className="flex items-center gap-2 text-xs font-semibold text-[#0284C7] hover:text-[#0369a1]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects List
        </button>
        <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 shadow-xs">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h3 className="text-base font-bold text-[#0F172A]">Project Not Found</h3>
          <p className="text-xs text-[#64748B]">The requested project workspace could not be found or has been removed.</p>
        </div>
      </div>
    );
  }

  const safeSequences = Array.isArray(sequences) ? sequences : [];
  const safeAnalyses = Array.isArray(analyses) ? analyses : [];
  const safeVersions = Array.isArray(versions) ? versions : [];
  const safeActivities = Array.isArray(activities) ? activities : [];

  const filteredSequences = safeSequences.filter((s) => {
    const q = seqSearch.toLowerCase();
    return (
      (s.accession || '').toLowerCase().includes(q) ||
      (s.definition || '').toLowerCase().includes(q) ||
      (s.organism || '').toLowerCase().includes(q)
    );
  });

  const filteredAnalyses = safeAnalyses.filter((a) => {
    const q = anaSearch.toLowerCase();
    return (
      (a.analysis_type || '').toLowerCase().includes(q) ||
      (a.input_source || '').toLowerCase().includes(q) ||
      (a.result_summary || '').toLowerCase().includes(q)
    );
  });

  const tagsList = Array.isArray(project.tags)
    ? project.tags
    : typeof project.tags === 'string'
    ? project.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const existingSeqIds = safeSequences.map((s) => s.id);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-7xl mx-auto">
      {/* Top Banner & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-6">
        <div className="space-y-3 min-w-0">
          <button
            onClick={onBackToList}
            className="flex items-center gap-2 text-xs font-semibold text-[#0284C7] hover:text-[#0369a1] transition-colors group cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Projects Workspace</span>
          </button>

          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight break-words">{project.name}</h1>
            <span
              className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${
                project.status === 'Archived'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {project.status}
            </span>
            <span className="text-xs font-mono text-[#0284C7] bg-[#F1F5F9] px-2.5 py-1 rounded-md border border-[#CBD5E1]">
              {project.organism || 'Homo sapiens'}
            </span>
          </div>

          {project.description && <p className="text-xs text-[#475569] max-w-3xl leading-relaxed">{project.description}</p>}

          {tagsList.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <Tag className="w-3 h-3 text-[#94A3B8] mr-1" />
              {tagsList.map((tag, idx) => (
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

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {onOpenAiWithContext && project && (
            <button
              onClick={() => {
                onOpenAiWithContext({
                  type: 'project',
                  projectId: project.id,
                  projectName: project.name,
                  organism: project.organism || 'Homo sapiens',
                  researchObjective: project.description || 'Project research workspace',
                  associatedSequences: sequences.map((s) => ({
                    id: s.id,
                    accession: s.accession || s.definition || 'Sequence',
                    name: s.definition || s.accession,
                    length: s.total_length || 0,
                    type: s.sequence_type,
                  })),
                });
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-pink-50 hover:bg-pink-100 text-[#EC4899] border border-pink-200 font-medium text-xs transition-colors cursor-pointer shadow-xs font-mono"
              title="Ask BioAI about this project"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Ask BioAI</span>
            </button>
          )}

          <button
            onClick={() => setIsAddSeqModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Sequence</span>
          </button>

          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] font-medium text-xs transition-colors cursor-pointer border border-[#CBD5E1]"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          {project.status !== 'Archived' && (
            <button
              onClick={handleArchiveProject}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 font-medium text-xs transition-colors cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-mono flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] space-y-1 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium">Associated Sequences</span>
            <Dna className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div className="text-xl font-bold text-[#0F172A] font-mono">{safeSequences.length.toLocaleString()}</div>
          <p className="text-[10px] text-[#94A3B8] font-mono">Linked biological records</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] space-y-1 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium">Analyses Executed</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-[#0F172A] font-mono">{safeAnalyses.length.toLocaleString()}</div>
          <p className="text-[10px] text-[#94A3B8] font-mono">Pipelines run in project</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] space-y-1 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium">Modified Versions</span>
            <GitBranch className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-[#0F172A] font-mono">{safeVersions.length.toLocaleString()}</div>
          <p className="text-[10px] text-[#94A3B8] font-mono">V2 mutation studies</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] space-y-1 shadow-xs">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-xs font-medium">Last Activity</span>
            <Clock className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div className="text-xs font-bold text-[#0F172A] font-mono truncate">
            {project.lastActivity ? new Date(project.lastActivity).toLocaleDateString() : 'Today'}
          </div>
          <p className="text-[10px] text-[#94A3B8] font-mono">Synced to Supabase</p>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="border-b border-[#E2E8F0] flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'overview'
              ? 'border-[#0284C7] text-[#0284C7]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('sequences')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'sequences'
              ? 'border-[#0284C7] text-[#0284C7]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Dna className="w-4 h-4" />
          <span>Sequences ({safeSequences.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('analyses')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'analyses'
              ? 'border-[#0284C7] text-[#0284C7]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Analyses ({safeAnalyses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('versions')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'versions'
              ? 'border-[#0284C7] text-[#0284C7]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>Versions ({safeVersions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'activity'
              ? 'border-[#0284C7] text-[#0284C7]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Activity Log</span>
        </button>
      </div>

      {/* Tab Panels */}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Research Objective Card */}
            <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-3 shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0284C7]" />
                <span>Research Objective</span>
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed font-sans">
                {project.research_objective ||
                  'No specific research objective defined. Edit project details to establish primary biological hypotheses, variant scan targets, or thermostability benchmarking metrics.'}
              </p>
            </div>

            {/* Recent Sequences List */}
            <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Dna className="w-4 h-4 text-[#0284C7]" />
                  <span>Recent Project Sequences</span>
                </h3>
                <button
                  onClick={() => setActiveTab('sequences')}
                  className="text-xs text-[#0284C7] hover:underline cursor-pointer font-medium"
                >
                  View All ({safeSequences.length})
                </button>
              </div>

              {safeSequences.length === 0 ? (
                <div className="py-8 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs text-[#64748B]">No sequences linked to this project yet.</p>
                  <button
                    onClick={() => setIsAddSeqModalOpen(true)}
                    className="mt-2 text-xs text-[#0284C7] font-semibold cursor-pointer"
                  >
                    + Add First Sequence
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {safeSequences.slice(0, 4).map((seq) => (
                    <div
                      key={seq.id}
                      className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#38BDF8] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-[#0284C7]">{seq.accession}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-[#475569] border border-[#CBD5E1]">
                            {seq.sequence_type || 'Genomic DNA'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B] truncate">{seq.definition || seq.organism}</p>
                      </div>

                      <button
                        onClick={() =>
                          onOpenWorkbench(
                            seq.sequence || '',
                            {
                              accession: seq.accession,
                              organism: seq.organism || 'Homo sapiens',
                              definition: seq.definition || '',
                              source: seq.source
                            },
                            undefined,
                            undefined,
                            project.id,
                            seq.id
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#0284C7] border border-sky-200 text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        <span>Analyze</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Metrics & Activity Summary */}
          <div className="space-y-6">
            <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0284C7]" />
                <span>Recent Activity</span>
              </h3>

              {safeActivities.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">No activity recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {safeActivities.slice(0, 5).map((act) => (
                    <div key={act.id} className="text-xs space-y-0.5 border-l-2 border-[#38BDF8] pl-3 py-0.5">
                      <p className="font-semibold text-[#0F172A]">{act.title}</p>
                      <p className="text-[11px] text-[#64748B] leading-tight">{act.description}</p>
                      <p className="text-[10px] font-mono text-[#94A3B8]">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SEQUENCES TAB */}
      {activeTab === 'sequences' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <input
                type="text"
                value={seqSearch}
                onChange={(e) => setSeqSearch(e.target.value)}
                placeholder="Search sequences by accession or definition..."
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono shadow-2xs"
              />
            </div>
            <button
              onClick={() => setIsAddSeqModalOpen(true)}
              className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Sequence to Project</span>
            </button>
          </div>

          {filteredSequences.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 shadow-xs">
              <Dna className="w-10 h-10 text-[#94A3B8] mx-auto" />
              <h3 className="text-sm font-semibold text-[#0F172A]">No sequences in this project</h3>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                Add an existing database sequence or import a new FASTA / raw sequence to associate it with this project.
              </p>
              <button
                onClick={() => setIsAddSeqModalOpen(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Sequence
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSequences.map((seq) => (
                <div
                  key={seq.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#38BDF8] transition-all flex flex-col justify-between space-y-4 group shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-[#0284C7] break-all">{seq.accession}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
                        {seq.sequence_type || 'Genomic DNA'}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[#0F172A] line-clamp-2">{seq.definition || seq.organism}</p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#64748B] pt-1">
                      <span>Organism: {seq.organism || 'Homo sapiens'}</span>
                      <span>•</span>
                      <span>
                        {(seq.total_length || 0).toLocaleString()} {seq.sequence_type === 'PROTEIN' ? 'aa' : 'bp'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => handleRemoveSequence(seq.id, seq.accession)}
                      className="text-xs text-[#64748B] hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Remove from project (keeps in database)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>

                    <button
                      onClick={() =>
                        onOpenWorkbench(
                          seq.sequence || '',
                          {
                            accession: seq.accession,
                            organism: seq.organism || 'Homo sapiens',
                            definition: seq.definition || '',
                            source: seq.source
                          },
                          undefined,
                          undefined,
                          project.id,
                          seq.id
                        )
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Dna className="w-3.5 h-3.5" />
                      <span>Open in Workbench</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ANALYSES TAB */}
      {activeTab === 'analyses' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              value={anaSearch}
              onChange={(e) => setAnaSearch(e.target.value)}
              placeholder="Search project analyses by type or source..."
              className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono shadow-2xs"
            />
          </div>

          {filteredAnalyses.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 shadow-xs">
              <Activity className="w-10 h-10 text-[#94A3B8] mx-auto" />
              <h3 className="text-sm font-semibold text-[#0F172A]">No analyses executed for this project yet</h3>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                Open a project sequence in the Workbench and run a pipeline to generate saved analyses automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAnalyses.map((ana) => {
                const res = ana.results || {};
                const verNum = res.versionNumber || (ana.result_summary?.includes('V2') ? 2 : 1);
                const isV2 = verNum === 2;

                return (
                  <div
                    key={ana.id}
                    className="p-5 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#38BDF8] transition-all space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A] flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        {ana.analysis_type}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                          isV2
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isV2 ? 'V2 (Mutated)' : 'V1 (Original)'}
                      </span>
                    </div>

                    <p className="text-xs text-[#475569] leading-relaxed font-mono truncate">
                      {ana.result_summary || 'Analysis Completed'}
                    </p>

                    <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B] pt-2 border-t border-[#E2E8F0]">
                      <span>Source: {ana.input_source || 'Sequence'}</span>
                      <span>{new Date(ana.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VERSIONS TAB */}
      {activeTab === 'versions' && (
        <div className="space-y-4">
          {safeVersions.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 shadow-xs">
              <GitBranch className="w-10 h-10 text-[#94A3B8] mx-auto" />
              <h3 className="text-sm font-semibold text-[#0F172A]">No version history recorded yet</h3>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                Use the Sequence Editor inside the Workbench to apply point mutations and run V2 analyses to populate version histories.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {safeVersions.map((v) => (
                <div
                  key={v.id}
                  className="p-4 rounded-xl bg-white border border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 shadow-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#0F172A]">{v.label}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569]">
                        {v.analysisType}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B]">{v.summary}</p>
                  </div>
                  <div className="text-left sm:text-right text-[11px] font-mono text-[#64748B] shrink-0">
                    {new Date(v.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACTIVITY TAB */}
      {activeTab === 'activity' && (
        <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] space-y-6 shadow-xs">
          <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#0284C7]" />
            <span>Project Activity Timeline</span>
          </h3>

          {safeActivities.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No activity recorded for this project yet.</p>
          ) : (
            <div className="relative border-l-2 border-[#E2E8F0] ml-4 space-y-6 pl-6 py-2">
              {safeActivities.map((act) => (
                <div key={act.id} className="relative group">
                  <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-[#0284C7] border-2 border-white" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs font-bold text-[#0F172A]">{act.title}</h4>
                      <span className="text-[10px] font-mono text-[#94A3B8]">
                        {new Date(act.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] leading-relaxed">{act.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AddSequenceModal
        isOpen={isAddSeqModalOpen}
        projectId={project.id}
        userId={user?.id}
        existingSequenceIds={existingSeqIds}
        onClose={() => setIsAddSeqModalOpen(false)}
        onSuccess={() => {
          loadProjectData();
          setActionMsg('Sequence associated with project.');
          setTimeout(() => setActionMsg(null), 3000);
        }}
      />

      <EditProjectModal
        isOpen={isEditModalOpen}
        project={project}
        userId={user?.id}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={(updated) => {
          setProject(updated);
          setActionMsg('Project metadata updated.');
          setTimeout(() => setActionMsg(null), 3000);
        }}
      />
    </div>
  );
};
