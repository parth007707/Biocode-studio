import { GCAndORFAnalysisResult } from './types';
import { AminoAcidComposition } from './proteinAnalysis';
import { RNASecondaryStructureResult } from './rnaAnalysis';
import { SequenceSourceMetadata } from '../../services/adapters/types';

export interface ScientificInterpretation {
  title: string;
  category: 'DNA' | 'RNA' | 'PROTEIN';
  executiveSummary: string;
  biophysicalInsights: string[];
  structuralImplications: string[];
  functionalPredictions: string[];
  confidenceDisclaimer: string;
}

export function generateDNAInterpretation(
  sequence: string,
  analysis: GCAndORFAnalysisResult,
  metadata?: SequenceSourceMetadata | null
): ScientificInterpretation {
  const { composition, orfs, longestOrf, startCodonsCount, stopCodonsCount } = analysis;
  const gc = composition.gcPercentage;
  const len = composition.length;

  // Thermal stability and melting temperature approximation (Wallace rule for < 14 bp, Marmur-Doty/nearest-neighbor approximation for >= 14 bp)
  const estimatedTm = len < 14 
    ? Math.round((composition.counts['A'] + composition.counts['T']) * 2 + (composition.counts['G'] + composition.counts['C']) * 4)
    : Number((64.9 + 41 * (composition.gcCount - 16.4) / len).toFixed(1));

  let gcCategory = 'Balanced GC content (eukaryotic norm)';
  let gcExplanation = `GC fraction is ${gc}%, aligning with typical eukaryotic genomic equilibrium (~40-60%).`;
  if (gc > 60) {
    gcCategory = 'High GC content (GC-rich)';
    gcExplanation = `High GC fraction (${gc}%) confers elevated thermal stability due to triple hydrogen bonding (G≡C) and increased base-stacking enthalpy, yielding an estimated melting temperature (Tm) of ~${estimatedTm}°C.`;
  } else if (gc < 40) {
    gcCategory = 'Low GC content (AT-rich)';
    gcExplanation = `AT-rich composition (${composition.atPercentage}%) exhibits lower thermodynamic duplex stability and an estimated Tm of ~${estimatedTm}°C, commonly associated with promoter regions, replication origins (ori), or AT-biased microbial genomes.`;
  }

  const topology = metadata?.topology || 'linear';
  const strand = metadata?.strand || 'double-stranded';
  const isCircular = topology === 'circular';

  const biophysical: string[] = [
    `${gcCategory}: ${gcExplanation}`,
    `Duplex Stability: Estimated melting temperature Tm ≈ ${estimatedTm}°C at 50mM monovalent salt concentration.`,
    `Nucleotide Distribution: A: ${composition.counts['A']} (${((composition.counts['A']/len)*100).toFixed(1)}%), T: ${composition.counts['T']} (${((composition.counts['T']/len)*100).toFixed(1)}%), G: ${composition.counts['G']} (${((composition.counts['G']/len)*100).toFixed(1)}%), C: ${composition.counts['C']} (${((composition.counts['C']/len)*100).toFixed(1)}%).`,
    `Strand & Topology: ${strand === 'double-stranded' ? 'Double-stranded B-DNA duplex' : 'Single-stranded DNA'}, ${isCircular ? 'closed circular' : 'linear'} conformation.`
  ];

  const structural: string[] = [
    `B-DNA Helical Parameters: Double helix forms ~10.4-10.5 base pairs per complete turn (3.4 nm pitch), with right-handed chirality.`,
    `Helix Span: Spans approximately ${(len * 0.34).toFixed(1)} nm along the helical longitudinal axis in physiological aqueous conditions.`
  ];

  const functional: string[] = [];
  if (longestOrf && longestOrf.lengthAa >= 10) {
    functional.push(
      `Putative Coding Potential: Detected primary Open Reading Frame in Frame ${longestOrf.frame > 0 ? `+${longestOrf.frame}` : longestOrf.frame} spanning ${longestOrf.lengthBp} bp (${longestOrf.lengthAa} amino acids), encoding candidate polypeptide: ${longestOrf.proteinSequence.substring(0, 16)}...`
    );
  } else {
    functional.push(
      `Non-coding or Fragmentary Profile: No continuous ORF exceeding 30 bp detected. Likely represents a regulatory non-coding locus, primer/probe fragment, or intergenic spacer.`
    );
  }

  functional.push(
    `Initiation & Termination Sites: Identified ${startCodonsCount} ATG canonical initiation triplets and ${stopCodonsCount} nonsense stop codons across forward and reverse reading frames (+1, +2, +3, -1, -2, -3).`
  );

  const accLabel = metadata?.accession ? ` (${metadata.accession})` : '';
  const seqTypeTitle = metadata?.sequence_type || 'Genomic DNA';

  return {
    title: `${seqTypeTitle} Evaluation`,
    category: 'DNA',
    executiveSummary: `Analyzed ${len} bp double-stranded DNA construct${accLabel}. Exhibits ${gc}% GC / ${composition.atPercentage}% AT content with ${orfs.length} detected open reading frame(s). Estimated thermodynamic melting temperature is ${estimatedTm}°C.`,
    biophysicalInsights: biophysical,
    structuralImplications: structural,
    functionalPredictions: functional,
    confidenceDisclaimer: 'Thermodynamic and ORF predictions are computational approximations computed directly from sequence statistics and do not account for epigenetic modifications (e.g., 5mC methylation).'
  };
}

export function generateRNAInterpretation(
  rnaAnalysis: RNASecondaryStructureResult,
  metadata?: SequenceSourceMetadata | null,
  sequence?: string,
  dnaAnalysis?: GCAndORFAnalysisResult | null
): ScientificInterpretation {
  const { length, gcPercentage, auPercentage, stemCount, loopCount, estimatedFreeEnergyKcal, hairpins } = rnaAnalysis;

  const accUpper = (metadata?.accession || '').toUpperCase();
  const moltype = (metadata?.molecule_type || metadata?.moleculeType || '').toLowerCase();
  const seqType = (metadata?.sequence_type || metadata?.sequenceType || '').toLowerCase();
  const isMrna = accUpper.startsWith('NM_') || accUpper.startsWith('XM_') || moltype === 'mrna' || seqType.includes('mrna');
  const isNcRNA = accUpper.startsWith('NR_') || accUpper.startsWith('XR_') || moltype === 'ncrna' || seqType.includes('non-coding');
  const isViralGenomic = moltype.includes('genomic rna') || seqType.includes('viral') || accUpper.startsWith('NC_045512');

  let title = 'RNA Secondary Structure & Thermodynamic Profile';
  if (isMrna) title = 'Single-Stranded mRNA Transcript Profile';
  else if (isNcRNA) title = 'Non-Coding RNA (ncRNA) Structural Profile';
  else if (isViralGenomic) title = 'Viral Genomic Single-Stranded RNA Profile';

  const biophysical: string[] = [
    `Base Composition: GC: ${gcPercentage}%, AU: ${auPercentage}%, Purines (A+G): ${rnaAnalysis.purinePercentage}%, Pyrimidines (C+U): ${rnaAnalysis.pyrimidinePercentage}%.`,
    `Ribonucleic Acid Backbone: Single-stranded chain with ribose 2'-hydroxyl (2'-OH) groups enabling specific tertiary contacts and non-canonical base pairing.`,
    `Estimated Folding Free Energy (ΔG): ~${estimatedFreeEnergyKcal} kcal/mol. Negative free energy indicates spontaneous, thermodynamically favored intramolecular secondary folding in physiological buffers.`,
    `A-Form Helical Propensity: RNA duplex stem regions adopt canonical compact A-form geometry (11 base pairs per turn) due to C3'-endo ribose sugar pucker.`
  ];

  const structural: string[] = [
    `Secondary Structure Elements: Predicted ${stemCount} base-paired stem region(s) and ${loopCount} single-stranded hairpin terminal loop(s).`,
    hairpins.length > 0 
      ? `Prominent Hairpin: Terminal loop at residues ${hairpins[0].loopStart}-${hairpins[0].loopEnd} ("${hairpins[0].loopSequence}") stabilized by adjacent helical stem.`
      : `Extended / Open Conformation: Sequence shows high proportion of unpaired accessible single-stranded regions.`
  ];

  const functional: string[] = [];

  if (isMrna) {
    if (dnaAnalysis?.longestOrf && dnaAnalysis.longestOrf.lengthAa >= 10) {
      functional.push(
        `Coding Sequence (CDS) Translation: Detected primary Open Reading Frame encoding a ${dnaAnalysis.longestOrf.lengthAa}-residue polypeptide (${dnaAnalysis.longestOrf.proteinSequence.substring(0, 16)}...).`
      );
    }
    functional.push(
      `Mature Transcript Features: Single-stranded mRNA features 5' to 3' translation orientation, initiation triplets (AUG), and structural stem-loops regulating transcript stability and ribosome elongation.`
    );
  } else if (isNcRNA) {
    functional.push(
      `Non-Coding Riboregulatory Profile: Absence of long conserved protein-coding sequence. Functions via secondary structure scaffolding, ribonucleoprotein (RNP) complex formation, or target RNA binding.`
    );
  } else if (isViralGenomic) {
    functional.push(
      `Viral Genome Organization: Single-stranded viral RNA genome with secondary structure elements essential for viral replication, packaging, and subgenomic transcription.`
    );
  } else {
    functional.push(
      stemCount > 0 
        ? `Structural Stability: Base-pairing patterns suggest structural RNA characteristics (e.g. riboswitch aptamer, stem-loop hairpin, or UTR regulatory element).`
        : `Linear / Accessible Conformation: Low pairing density provides accessible single-stranded regions for hybridization or scanning.`
    );
  }

  const accLabel = metadata?.accession ? ` (${metadata.accession})` : '';
  const moleculeDesc = isMrna ? 'single-stranded mRNA transcript' : isNcRNA ? 'single-stranded non-coding RNA' : isViralGenomic ? 'single-stranded viral genomic RNA' : 'single-stranded RNA transcript';

  return {
    title,
    category: 'RNA',
    executiveSummary: `Analyzed ${length} nt ${moleculeDesc}${accLabel}. Features ${gcPercentage}% GC and ${auPercentage}% AU composition. Secondary structure prediction reveals ${stemCount} stem region(s) and ${loopCount} loop(s) with an estimated folding energy of ${estimatedFreeEnergyKcal} kcal/mol.`,
    biophysicalInsights: biophysical,
    structuralImplications: structural,
    functionalPredictions: functional,
    confidenceDisclaimer: 'Secondary structure prediction utilizes dynamic programming (Nussinov base-pairing model with Turner parameter approximations) and represents the dominant minimum free energy conformation in vitro.'
  };
}

export function generateProteinInterpretation(
  proteinAnalysis: AminoAcidComposition,
  metadata?: SequenceSourceMetadata | null
): ScientificInterpretation {
  const { length, molecularWeightKDa, isoelectricPoint, netChargeAtPh7, gravyScore, hydrophobicPercentage, polarPercentage, positivelyChargedCount, negativelyChargedCount, predictedSecondaryStructure } = proteinAnalysis;

  let chargeNature = 'near neutral';
  if (netChargeAtPh7 > 1.5) chargeNature = 'predominantly basic (cationic)';
  else if (netChargeAtPh7 < -1.5) chargeNature = 'predominantly acidic (anionic)';

  let solubilityDesc = 'Globular soluble protein profile with well-balanced surface hydration.';
  if (gravyScore > 0.3) {
    solubilityDesc = 'Hydrophobic profile (GRAVY > 0.3): Characteristic of transmembrane alpha-helices or hydrophobic core assemblies.';
  } else if (gravyScore < -0.5) {
    solubilityDesc = 'Highly hydrophilic profile (GRAVY < -0.5): Highly water-soluble, likely localized to cytosolic or extracellular aqueous compartments.';
  }

  const biophysical: string[] = [
    `Molecular Mass: Estimated molecular weight of ~${molecularWeightKDa} kDa (~${proteinAnalysis.molecularWeightDa.toLocaleString()} Da) based on standard amino acid residue condensation.`,
    `Isoelectric Point (pI): Calculated pI = ${isoelectricPoint}. At physiological pH (7.4), the net formal charge is ${netChargeAtPh7 > 0 ? `+${netChargeAtPh7}` : netChargeAtPh7} (${chargeNature}).`,
    `Hydropathy (GRAVY Score): ${gravyScore}. ${solubilityDesc}`
  ];

  const structural: string[] = [
    `Conformational Propensity: Predicted dominant secondary structure is ${predictedSecondaryStructure.dominantConformation} (Helix score: ${predictedSecondaryStructure.helixPropensity}, Sheet score: ${predictedSecondaryStructure.sheetPropensity}).`,
    `Residue Partitioning: ${hydrophobicPercentage}% Hydrophobic residues (A, V, I, L, M, F, W, P), ${polarPercentage}% Polar uncharged residues (S, T, C, Y, N, Q), and ${positivelyChargedCount + negativelyChargedCount} Charged residues (+${positivelyChargedCount}/-${negativelyChargedCount}).`
  ];

  const functional: string[] = [
    `Electrostatic Landscape: Basic (+${positivelyChargedCount}) and Acidic (-${negativelyChargedCount}) residues generate electrostatic dipole moments influencing protein-protein and protein-nucleic acid interactions.`,
    length > 30 
      ? `Full-length domain assembly capable of tertiary folding into a stable compact structural core.`
      : `Short peptide / oligopeptide sequence. Typically functions as a signaling peptide, epitope, or flexible binding loop.`
  ];

  const accLabel = metadata?.accession ? ` (${metadata.accession})` : '';

  return {
    title: 'Protein Biophysical & Structural Characterization',
    category: 'PROTEIN',
    executiveSummary: `Polypeptide construct${accLabel} (${length} residues) with an estimated molecular weight of ${molecularWeightKDa} kDa and isoelectric point of ${isoelectricPoint}. Exhibiting ${predictedSecondaryStructure.dominantConformation} conformational bias and a GRAVY hydropathy index of ${gravyScore}.`,
    biophysicalInsights: biophysical,
    structuralImplications: structural,
    functionalPredictions: functional,
    confidenceDisclaimer: 'Tertiary 3D model coordinates are generated using secondary structure propensity algorithms (Chou-Fasman / de novo backbone modeling). For atomic-precision experimental coordinates, cross-reference the RCSB Protein Data Bank.'
  };
}
