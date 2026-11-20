import React from 'react';
import { ArrowRight, Sparkles, Dna } from 'lucide-react';
import { TargetSequence } from '../../types';
import { AbstractBiologicalNetwork3D } from './animation/AbstractBiologicalNetwork3D';

interface WorkspaceHeroSectionProps {
  onStartAnalysis: () => void;
  onAskBioAi: () => void;
  onExploreSequence?: () => void;
  currentTarget: TargetSequence;
}

export const WorkspaceHeroSection: React.FC<WorkspaceHeroSectionProps> = ({
  onStartAnalysis,
  onAskBioAi,
  currentTarget
}) => {
  return (
    <section 
      aria-label="BioCode Studio Intelligence Workspace"
      className="relative rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-10 border border-sky-300/80 bg-gradient-to-br from-sky-100/90 via-sky-50/75 to-indigo-50/60 shadow-[0_12px_36px_rgba(14,165,233,0.12)] overflow-hidden transition-all duration-300"
    >
      {/* Subtle Scientific Background Depth & Molecular Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-30" 
        style={{
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(14, 165, 233, 0.35) 1px, transparent 0),
            linear-gradient(to right, rgba(14, 165, 233, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(14, 165, 233, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px, 48px 48px, 48px 48px'
        }}
      />

      {/* Atmospheric Radial Color Accents (Sky Blue, Purple, Pink) */}
      <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-sky-300/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-pink-200/25 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-purple-200/20 blur-3xl pointer-events-none" />

      {/* Delicate decorative scientific connection points */}
      <div className="absolute top-4 right-1/3 hidden lg:flex items-center gap-1.5 opacity-40 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        <span className="w-12 h-[1px] bg-sky-300" />
        <span className="w-1 h-1 rounded-full bg-purple-400" />
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
        {/* ================================================================= */}
        {/* LEFT SIDE: Content & Action Triggers (~54%)                       */}
        {/* ================================================================= */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-6 min-w-0">
          {/* Eyebrow */}
          <div className="flex items-center gap-2 flex-wrap font-sans">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-sky-500/15 border border-sky-300 text-xs font-display font-[700] text-sky-800 tracking-wider uppercase shadow-2xs">
              <Dna className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
              <span>BIOCODE STUDIO</span>
            </span>
            <span className="text-xs font-sans font-[600] text-sky-700/80 tracking-wide uppercase">
              COMPUTATIONAL BIOLOGY PLATFORM
            </span>
          </div>

          {/* Main Heading */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl lg:text-[46px] xl:text-[54px] font-[800] text-[#0F172A] tracking-[-0.035em] leading-[1.06] font-display break-words">
              Computational Biology <br />
              <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
                Intelligence Workspace
              </span>
            </h1>

            {/* Description (2-3 lines clean) */}
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed max-w-xl font-sans font-[400] pt-1">
              Analyze biological sequences, explore molecular structures, and investigate biological patterns through computational biology and AI-assisted research.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1 font-sans">
            {/* Primary: START ANALYSIS → */}
            <button
              type="button"
              onClick={onStartAnalysis}
              className="w-full sm:w-auto justify-center px-5 sm:px-6 py-3 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] hover:from-[#0284C7] hover:to-[#0EA5E9] text-white font-[600] text-xs tracking-wide uppercase shadow-[0_4px_16px_rgba(14,165,233,0.35)] hover:shadow-[0_6px_22px_rgba(14,165,233,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>START ANALYSIS</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            {/* Secondary: ASK BIOAI ✨ */}
            <button
              type="button"
              onClick={onAskBioAi}
              className="w-full sm:w-auto justify-center px-5 sm:px-6 py-3 rounded-xl bg-white hover:bg-pink-50/70 text-[#EC4899] border-2 border-pink-300 hover:border-pink-400 font-[600] text-xs tracking-wide uppercase shadow-[0_2px_10px_rgba(236,72,153,0.12)] hover:shadow-[0_4px_16px_rgba(236,72,153,0.22)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>ASK BIOAI</span>
              <Sparkles className="w-4 h-4 text-[#EC4899]" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT SIDE: Sophisticated Abstract 3D Scientific Visual (~46%)   */}
        {/* ================================================================= */}
        <div className="lg:col-span-5 h-[240px] sm:h-[310px] md:h-[340px] w-full relative">
          <div className="w-full h-full rounded-2xl bg-white/40 backdrop-blur-xs border border-sky-200/70 shadow-inner overflow-hidden flex items-center justify-center">
            <AbstractBiologicalNetwork3D currentTarget={currentTarget} />
          </div>
        </div>
      </div>
    </section>
  );
};
