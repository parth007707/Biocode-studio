import React, { useState, useEffect } from 'react';
import { X, FolderKanban, Loader2, AlertCircle } from 'lucide-react';
import { Project } from '../../types';
import { bioService } from '../../services/bioService';

interface EditProjectModalProps {
  isOpen: boolean;
  project: Project;
  userId?: string;
  onClose: () => void;
  onSuccess: (updated: Project) => void;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  isOpen,
  project,
  userId,
  onClose,
  onSuccess
}) => {
  const [name, setName] = useState<string>(project.name || '');
  const [description, setDescription] = useState<string>(project.description || '');
  const [researchObjective, setResearchObjective] = useState<string>(project.research_objective || '');
  const [tagsInput, setTagsInput] = useState<string>(
    Array.isArray(project.tags) ? project.tags.join(', ') : typeof project.tags === 'string' ? project.tags : ''
  );
  const [organism, setOrganism] = useState<string>(project.organism || 'Homo sapiens');
  const [status, setStatus] = useState<'Active' | 'Archived' | 'Processing'>(project.status || 'Active');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(project.name || '');
      setDescription(project.description || '');
      setResearchObjective(project.research_objective || '');
      setTagsInput(
        Array.isArray(project.tags) ? project.tags.join(', ') : typeof project.tags === 'string' ? project.tags : ''
      );
      setOrganism(project.organism || 'Homo sapiens');
      setStatus(project.status || 'Active');
      setErrorMsg(null);
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Project name is required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const updated = await bioService.updateProject(project.id, {
        name: cleanName,
        description: description.trim(),
        research_objective: researchObjective.trim(),
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        organism: organism.trim(),
        status
      }, userId);

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 sm:p-6 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[#0284C7] shrink-0" />
            <span>Edit Project Metadata</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
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
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#334155]">Organism Reference</label>
              <input
                type="text"
                value={organism}
                onChange={(e) => setOrganism(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#334155]">Project Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] font-mono cursor-pointer"
              >
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
                <option value="Processing">Processing</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#334155]">Research Objective</label>
            <input
              type="text"
              value={researchObjective}
              onChange={(e) => setResearchObjective(e.target.value)}
              placeholder="e.g., Evaluate thermostability and fluorescence emission changes"
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#334155]">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., GFP, Mutation, Fluorescence"
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#334155]">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] resize-none leading-relaxed"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-4 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto justify-center px-6 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
