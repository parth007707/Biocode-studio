import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalysisRecord, formatOrganism } from '../types';
import {
  analyzeGCAndORF,
  analyzeProteinSequence,
  predictRNASecondaryStructure,
  generateDNAInterpretation,
  generateRNAInterpretation,
  generateProteinInterpretation,
  GCAndORFAnalysisResult,
  AminoAcidComposition,
  RNASecondaryStructureResult,
  ScientificInterpretation
} from '../lib/bio';

// Color Palette for Professional Scientific Reports
const COLORS = {
  primary: [2, 132, 199] as [number, number, number], // #0284C7 Sky Blue
  primaryDark: [15, 23, 42] as [number, number, number], // #0F172A Slate Dark
  primaryLight: [240, 249, 255] as [number, number, number], // #F0F9FF Sky 50
  secondary: [99, 102, 241] as [number, number, number], // #6366F1 Indigo
  slateDark: [30, 41, 59] as [number, number, number], // #1E293B
  slateMedium: [71, 85, 105] as [number, number, number], // #475569
  slateLight: [248, 250, 252] as [number, number, number], // #F8FAFC
  border: [203, 213, 225] as [number, number, number], // #CBD5E1
  borderLight: [226, 232, 240] as [number, number, number], // #E2E8F0
  emerald: [16, 185, 129] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  rose: [225, 29, 72] as [number, number, number],
  purple: [147, 51, 234] as [number, number, number]
};

interface ComputedData {
  normalizedType: 'DNA' | 'RNA' | 'PROTEIN';
  fullSequence: string;
  dna: GCAndORFAnalysisResult | null;
  protein: AminoAcidComposition | null;
  rna: RNASecondaryStructureResult | null;
  interpretation: ScientificInterpretation | null;
}

/**
 * Computes or retrieves biological results and scientific interpretation for the report.
 */
function deriveBiologicalData(record: AnalysisRecord, overrideSequence?: string): ComputedData {
  const fullSeq = overrideSequence ||
    record.sequence_record?.sequence ||
    record.results?.sequence ||
    '';

  const rawType = (record.sequence_type || record.sequence_record?.sequence_type || 'DNA').toUpperCase();
  const normalizedType: 'DNA' | 'RNA' | 'PROTEIN' = 
    rawType.includes('PROT') || rawType.includes('AA') ? 'PROTEIN' :
    rawType.includes('RNA') ? 'RNA' : 'DNA';

  let dna: GCAndORFAnalysisResult | null = record.results?.dnaAnalysis || null;
  let protein: AminoAcidComposition | null = record.results?.proteinAnalysis || null;
  let rna: RNASecondaryStructureResult | null = record.results?.rnaAnalysis || null;

  if (fullSeq) {
    try {
      if (normalizedType === 'PROTEIN') {
        if (!protein) protein = analyzeProteinSequence(fullSeq);
      } else if (normalizedType === 'RNA') {
        if (!rna) rna = predictRNASecondaryStructure(fullSeq.slice(0, 5000));
        if (!dna) dna = analyzeGCAndORF(fullSeq, 'RNA');
      } else {
        if (!dna) dna = analyzeGCAndORF(fullSeq, 'DNA');
      }
    } catch (err) {
      console.warn('[PDF Generator] Bio computation warning:', err);
    }
  }

  // Derive interpretation
  let interpretation: ScientificInterpretation | null = null;
  try {
    const meta = {
      accession: record.sequence_record?.accession || record.input_source || 'Record',
      organism: record.sequence_record?.organism || 'Homo sapiens',
      sequence_type: normalizedType,
      topology: record.sequence_record?.topology || 'linear'
    };

    if (normalizedType === 'PROTEIN' && protein) {
      interpretation = generateProteinInterpretation(protein, meta as any);
    } else if (normalizedType === 'RNA' && rna) {
      interpretation = generateRNAInterpretation(rna, meta as any, fullSeq, dna);
    } else if (dna) {
      interpretation = generateDNAInterpretation(fullSeq, dna, meta as any);
    }
  } catch (err) {
    console.warn('[PDF Generator] Interpretation generation warning:', err);
  }

  return {
    normalizedType,
    fullSequence: fullSeq,
    dna,
    protein,
    rna,
    interpretation
  };
}

/**
 * Adds running header and running footer to all pages of a jsPDF document.
 */
function addRunningHeaderFooter(doc: jsPDF, accession: string, timestampStr: string) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // --- Header ---
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.5);
    doc.line(14, 12, pageWidth - 14, 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.primary);
    doc.text('BIOCODE STUDIO', 14, 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slateMedium);
    doc.text(`Sequence Analysis Report: ${accession}`, 45, 9.5);

    doc.text(`Generated: ${timestampStr}`, pageWidth - 14, 9.5, { align: 'right' });

    // --- Footer ---
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slateMedium);
    doc.text('BioCode Studio Genomic Intelligence • Confidential — For Scientific & Research Use Only', 14, pageHeight - 8);

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

/**
 * Generates an end-to-end professional scientific PDF audit report for an analysis record.
 */
export async function generateAnalysisReportPdf(
  record: AnalysisRecord,
  options?: { fullSequence?: string }
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let currentY = 18;

  const accession = record.sequence_record?.accession || record.input_source || 'SEQUENCE';
  const rawOrganism = record.sequence_record?.organism || 'Homo sapiens';
  const organism = formatOrganism(rawOrganism) || 'Homo sapiens';
  const pipeline = record.analysis_type || 'Sequence Analysis';
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const generationTimestamp = `${formattedDate} ${formattedTime}`;

  const bioData = deriveBiologicalData(record, options?.fullSequence);
  const totalLength = record.total_sequence_length || bioData.fullSequence.length || record.analyzed_length || 0;
  const analyzedLength = record.analyzed_length || bioData.fullSequence.length || totalLength;
  const unit = bioData.normalizedType === 'PROTEIN' ? 'aa' : 'bp';

  // ==========================================================================
  // 1. REPORT HERO HEADER BANNER
  // ==========================================================================
  doc.setFillColor(...COLORS.primaryDark);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2.5, 2.5, 'F');

  // Accent gradient line on bottom of banner
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, currentY + 22.5, contentWidth, 1.5, 'F');

  // Title inside banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BIOCODE STUDIO', margin + 6, currentY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 230, 253); // Sky 200
  doc.text('BIOINFORMATICS & GENOMICS AUDIT REPORT', margin + 6, currentY + 15);

  // Right-aligned report badge & date
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('AUTHENTICATED AUDIT RECORD', pageWidth - margin - 6, currentY + 9, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Audit ID: ${record.id.substring(0, 18)}...`, pageWidth - margin - 6, currentY + 15, { align: 'right' });

  currentY += 28;

  // ==========================================================================
  // 2. SAMPLE & PIPELINE SPECIFICATION CARD
  // ==========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('1. Sequence Specification & Execution Profile', margin, currentY);
  currentY += 3;

  const specRows = [
    [
      { content: 'Accession / ID:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: accession, styles: { fontStyle: 'bold' as const, textColor: COLORS.primary } },
      { content: 'Organism:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: organism, styles: { fontStyle: 'italic' as const } }
    ],
    [
      { content: 'Molecule Type:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: `${bioData.normalizedType} (${record.sequence_record?.molecule_type || 'Standard'})`, styles: { fontStyle: 'bold' as const } },
      { content: 'Topology / Strand:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: `${(record.sequence_record?.topology || 'Linear').toUpperCase()} • Standard Strand`, styles: {} }
    ],
    [
      { content: 'Analysis Pipeline:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: pipeline, styles: { fontStyle: 'bold' as const } },
      { content: 'Analysis Scope:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: record.analysis_scope || 'Complete Sequence', styles: {} }
    ],
    [
      { content: 'Analyzed Length:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: `${analyzedLength.toLocaleString()} ${unit} (${((analyzedLength / Math.max(1, totalLength)) * 100).toFixed(0)}% of total ${totalLength.toLocaleString()} ${unit})`, styles: { fontStyle: 'bold' as const } },
      { content: 'Execution Status:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: `[ ${record.status.toUpperCase()} ]`, styles: { textColor: COLORS.emerald, fontStyle: 'bold' as const } }
    ],
    [
      { content: 'Database Source:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: record._is_local_fallback ? 'Local Cache (Resilient Fallback)' : 'Supabase Cloud (PostgreSQL)', styles: {} },
      { content: 'Analysis Date:', styles: { fontStyle: 'bold' as const, textColor: COLORS.slateMedium } },
      { content: new Date(record.created_at).toLocaleString(), styles: {} }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    body: specRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: COLORS.borderLight,
      lineWidth: 0.25,
      textColor: COLORS.slateDark
    },
    columnStyles: {
      0: { cellWidth: 32, fillColor: COLORS.slateLight },
      1: { cellWidth: 58 },
      2: { cellWidth: 32, fillColor: COLORS.slateLight },
      3: { cellWidth: 60 }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Biological Definition text if available
  if (record.sequence_record?.definition) {
    doc.setFillColor(...COLORS.primaryLight);
    doc.setDrawColor(...COLORS.borderLight);
    doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.primary);
    doc.text('Biological Definition:', margin + 3, currentY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.slateDark);
    const defLines = doc.splitTextToSize(record.sequence_record.definition, contentWidth - 6);
    doc.text(defLines.slice(0, 2), margin + 3, currentY + 8);

    currentY += 15;
  }

  // ==========================================================================
  // 3. EXECUTIVE SCIENTIFIC INTERPRETATION
  // ==========================================================================
  if (bioData.interpretation) {
    const interp = bioData.interpretation;

    // Check page space
    if (currentY > 210) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primaryDark);
    doc.text('2. Executive Scientific Interpretation & Findings', margin, currentY);
    currentY += 4;

    // Executive summary callout box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, currentY, contentWidth, 16, 1.5, 1.5, 'FD');
    doc.line(margin, currentY, margin, currentY + 16); // Left thick accent

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.primary);
    doc.text('Executive Summary:', margin + 4, currentY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slateDark);
    const summaryLines = doc.splitTextToSize(interp.executiveSummary, contentWidth - 8);
    doc.text(summaryLines.slice(0, 3), margin + 4, currentY + 9);

    currentY += 19;

    // Insights Table
    const insightsBody: any[] = [];
    if (interp.biophysicalInsights.length > 0) {
      interp.biophysicalInsights.forEach(item => {
        insightsBody.push([
          { content: '• Biophysical Insight', styles: { fontStyle: 'bold' as const, textColor: COLORS.primary } },
          { content: item }
        ]);
      });
    }
    if (interp.structuralImplications.length > 0) {
      interp.structuralImplications.forEach(item => {
        insightsBody.push([
          { content: '• Structural Propensity', styles: { fontStyle: 'bold' as const, textColor: COLORS.purple } },
          { content: item }
        ]);
      });
    }
    if (interp.functionalPredictions.length > 0) {
      interp.functionalPredictions.forEach(item => {
        insightsBody.push([
          { content: '• Functional Prediction', styles: { fontStyle: 'bold' as const, textColor: COLORS.emerald } },
          { content: item }
        ]);
      });
    }

    if (insightsBody.length > 0) {
      autoTable(doc, {
        startY: currentY,
        body: insightsBody,
        theme: 'plain',
        styles: {
          fontSize: 7.5,
          cellPadding: 1.5,
          textColor: COLORS.slateDark,
          lineColor: COLORS.borderLight,
          lineWidth: 0.2
        },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: contentWidth - 40 }
        },
        margin: { left: margin, right: margin }
      });
      currentY = (doc as any).lastAutoTable.finalY + 6;
    }
  }

  // ==========================================================================
  // 4. BIOCHEMICAL & COMPOSITIONAL ANALYSIS TABLES
  // ==========================================================================
  if (currentY > 215) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('3. Biochemical Metrics & Compositional Distribution', margin, currentY);
  currentY += 4;

  if (bioData.normalizedType === 'PROTEIN' && bioData.protein) {
    const p = bioData.protein;
    const protMetrics = [
      ['Molecular Weight (kDa)', `${p.molecularWeightKDa} kDa (~${p.molecularWeightDa.toLocaleString()} Da)`],
      ['Isoelectric Point (pI)', `${p.isoelectricPoint}`],
      ['Net Charge (at pH 7.0)', `${p.netChargeAtPh7 > 0 ? `+${p.netChargeAtPh7}` : p.netChargeAtPh7}`],
      ['GRAVY Hydropathy Index', `${p.gravyScore} (${p.gravyScore > 0 ? 'Hydrophobic / Membrane candidate' : 'Hydrophilic / Soluble'})`],
      ['Dominant Secondary Structure', `${p.predictedSecondaryStructure.dominantConformation} (Helix: ${p.predictedSecondaryStructure.helixPropensity}, Sheet: ${p.predictedSecondaryStructure.sheetPropensity})`],
      ['Hydrophobic Residues', `${p.hydrophobicCount} residues (${p.hydrophobicPercentage}%)`],
      ['Polar Uncharged Residues', `${p.polarCount} residues (${p.polarPercentage}%)`],
      ['Positively Charged (Arg, Lys, His)', `${p.positivelyChargedCount} residues`],
      ['Negatively Charged (Asp, Glu)', `${p.negativelyChargedCount} residues`]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Physicochemical Parameter', 'Calculated Quantitative Value']],
      body: protMetrics,
      theme: 'striped',
      headStyles: {
        fillColor: COLORS.primaryDark,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        lineColor: COLORS.borderLight,
        lineWidth: 0.2
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold', textColor: COLORS.slateMedium },
        1: { cellWidth: contentWidth - 70, textColor: COLORS.slateDark }
      },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;

  } else if (bioData.dna) {
    const d = bioData.dna;
    const len = d.composition.length || 1;
    const isRna = bioData.normalizedType === 'RNA';

    // Nucleotide composition table
    const nucRows = [
      [
        'Adenine (A)',
        (d.composition.counts.A || 0).toLocaleString(),
        `${(((d.composition.counts.A || 0) / len) * 100).toFixed(2)}%`,
        'Purine (double ring)'
      ],
      [
        'Cytosine (C)',
        (d.composition.counts.C || 0).toLocaleString(),
        `${(((d.composition.counts.C || 0) / len) * 100).toFixed(2)}%`,
        'Pyrimidine (single ring)'
      ],
      [
        'Guanine (G)',
        (d.composition.counts.G || 0).toLocaleString(),
        `${(((d.composition.counts.G || 0) / len) * 100).toFixed(2)}%`,
        'Purine (double ring)'
      ],
      [
        isRna ? 'Uracil (U)' : 'Thymine (T)',
        ((isRna ? d.composition.counts.U : d.composition.counts.T) || 0).toLocaleString(),
        `${((((isRna ? d.composition.counts.U : d.composition.counts.T) || 0) / len) * 100).toFixed(2)}%`,
        'Pyrimidine (single ring)'
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Residue Base', 'Count (bp)', 'Molar Fraction (%)', 'Biochemical Classification']],
      body: nucRows,
      theme: 'striped',
      headStyles: {
        fillColor: COLORS.primaryDark,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        lineColor: COLORS.borderLight,
        lineWidth: 0.2
      },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold' },
        1: { cellWidth: 35, fontStyle: 'bold', textColor: COLORS.primary },
        2: { cellWidth: 40, fontStyle: 'bold' },
        3: { cellWidth: contentWidth - 120, textColor: COLORS.slateMedium }
      },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;

    // Summary key ratios ribbon
    const gcSkew = d.composition.gcCount > 0
      ? (((d.composition.counts.G || 0) - (d.composition.counts.C || 0)) / d.composition.gcCount).toFixed(4)
      : '0.0000';

    const ratioRows = [
      [
        { content: isRna ? 'GC / AU Content:' : 'GC / AT Content:', styles: { fontStyle: 'bold' as const, fillColor: COLORS.slateLight } },
        { content: `${d.composition.gcPercentage}% GC  |  ${isRna ? d.composition.auPercentage : d.composition.atPercentage}% ${isRna ? 'AU' : 'AT'}`, styles: { fontStyle: 'bold' as const, textColor: COLORS.primary } },
        { content: 'GC Skew [(G-C)/(G+C)]:', styles: { fontStyle: 'bold' as const, fillColor: COLORS.slateLight } },
        { content: `${gcSkew} (Replication polarity metric)`, styles: { fontStyle: 'bold' as const } }
      ],
      [
        { content: 'Total ORFs Identified:', styles: { fontStyle: 'bold' as const, fillColor: COLORS.slateLight } },
        { content: `${d.orfs.length} (across all 6 reading frames)`, styles: { fontStyle: 'bold' as const, textColor: COLORS.purple } },
        { content: 'Longest Candidate ORF:', styles: { fontStyle: 'bold' as const, fillColor: COLORS.slateLight } },
        { content: d.longestOrf ? `${d.longestOrf.lengthBp} bp (${d.longestOrf.lengthAa} aa, Frame ${d.longestOrf.frame > 0 ? `+${d.longestOrf.frame}` : d.longestOrf.frame})` : 'None detected', styles: { fontStyle: 'bold' as const } }
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      body: ratioRows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        lineColor: COLORS.borderLight,
        lineWidth: 0.25,
        textColor: COLORS.slateDark
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 45 },
        2: { cellWidth: 45 },
        3: { cellWidth: contentWidth - 135 }
      },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ==========================================================================
  // 5. OPEN READING FRAMES (ORFs) TABLE
  // ==========================================================================
  if (bioData.dna && bioData.dna.orfs.length > 0) {
    if (currentY > 215) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primaryDark);
    doc.text(`4. Open Reading Frames Translation Summary (Top ${Math.min(10, bioData.dna.orfs.length)} of ${bioData.dna.orfs.length})`, margin, currentY);
    currentY += 4;

    const orfRows = bioData.dna.orfs.slice(0, 10).map(orf => [
      orf.frame > 0 ? `+${orf.frame}` : `${orf.frame}`,
      orf.start.toLocaleString(),
      orf.end.toLocaleString(),
      `${orf.lengthBp.toLocaleString()} bp`,
      `${orf.lengthAa} aa`,
      orf.proteinSequence.length > 32 ? `${orf.proteinSequence.substring(0, 32)}...` : orf.proteinSequence
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Frame', 'Start (bp)', 'End (bp)', 'Length (bp)', 'Length (aa)', 'Peptide Sequence Preview']],
      body: orfRows,
      theme: 'striped',
      headStyles: {
        fillColor: COLORS.primaryDark,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: COLORS.borderLight,
        lineWidth: 0.2,
        textColor: COLORS.slateDark
      },
      columnStyles: {
        0: { cellWidth: 16, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 24 },
        2: { cellWidth: 24 },
        3: { cellWidth: 26, fontStyle: 'bold' },
        4: { cellWidth: 24, fontStyle: 'bold', textColor: COLORS.primary },
        5: { cellWidth: contentWidth - 114, fontStyle: 'normal' }
      },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ==========================================================================
  // 6. SEQUENCE PREVIEW EXCERPT
  // ==========================================================================
  if (bioData.fullSequence) {
    if (currentY > 210) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primaryDark);
    doc.text('5. Verified Sequence Text Excerpt', margin, currentY);
    currentY += 4;

    // Take up to 600 residues for clean display
    const previewSeq = bioData.fullSequence.slice(0, 600);
    const chunkLines: string[] = [];
    for (let i = 0; i < previewSeq.length; i += 60) {
      const lineIdx = i + 1;
      const sub = previewSeq.slice(i, i + 60);
      const groups = sub.match(/.{1,10}/g)?.join(' ') || sub;
      chunkLines.push(`${String(lineIdx).padStart(6, ' ')}  ${groups}`);
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    const boxHeight = chunkLines.length * 4.2 + 8;
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slateDark);

    let textY = currentY + 5.5;
    chunkLines.forEach(line => {
      doc.text(line, margin + 4, textY);
      textY += 4.2;
    });

    currentY += boxHeight + 2;

    if (bioData.fullSequence.length > 600) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.slateMedium);
      doc.text(`[ Excerpt showing residues 1 – 600 of total ${totalLength.toLocaleString()} ${unit}. Full complete FASTA can be exported directly from BioCode Studio. ]`, margin, currentY + 3);
      currentY += 6;
    }
  }

  // ==========================================================================
  // 7. AUDIT PROVENANCE & METHODOLOGY DISCLAIMER
  // ==========================================================================
  if (currentY > 235) {
    doc.addPage();
    currentY = 20;
  }

  currentY += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('6. Methodological & Computational Validation Notice', margin, currentY);
  currentY += 3.5;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...COLORS.borderLight);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...COLORS.slateMedium);
  const disclaimerText = [
    '• Algorithms: Thermodynamic melting estimates calculated using nearest-neighbor enthalpy & entropy models. ORF translation follows standard NCBI Genetic Code Table 1 (canonical start ATG; ochre TAA, amber TAG, opal TGA stops). Secondary structure predictions generated via Nussinov dynamic programming and Chou-Fasman propensity models.',
    '• Database Provenance: Analysis recorded with deterministic UUID in Supabase PostgreSQL data layer. Integrity assured via relational foreign keys and schema audit tracking.',
    '• Regulatory Notice: BioCode Studio reports are computational in silico analyses intended for research, academic, and biotechnical evaluation. Experimental assays should be conducted to confirm functional in vivo phenotypes.'
  ];

  let discY = currentY + 4;
  disclaimerText.forEach(dt => {
    const lines = doc.splitTextToSize(dt, contentWidth - 6);
    doc.text(lines, margin + 3, discY);
    discY += lines.length * 3.2 + 0.5;
  });

  // Add running headers & footers across all generated pages
  addRunningHeaderFooter(doc, accession, generationTimestamp);

  // Generate safe filename and trigger download
  const safeAccession = accession.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safePipeline = pipeline.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20);
  const filename = `BioCode_Report_${safeAccession}_${safePipeline}.pdf`;

  doc.save(filename);
}

/**
 * Generates an aggregated batch summary report PDF for multiple analysis records.
 */
export async function generateBatchSummaryReportPdf(
  analyses: AnalysisRecord[],
  title: string = 'BioCode Studio — Analysis Audit History Log'
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let currentY = 16;

  const now = new Date();
  const timestampStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Header Banner
  doc.setFillColor(...COLORS.primaryDark);
  doc.roundedRect(margin, currentY, contentWidth, 20, 2, 2, 'F');
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, currentY + 18.5, contentWidth, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('BIOCODE STUDIO', margin + 6, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text(title.toUpperCase(), margin + 6, currentY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(`TOTAL AUDITED RECORDS: ${analyses.length}`, pageWidth - margin - 6, currentY + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${timestampStr}`, pageWidth - margin - 6, currentY + 14, { align: 'right' });

  currentY += 25;

  const tableRows = analyses.map((rec, idx) => {
    const acc = rec.sequence_record?.accession || rec.input_source || 'Record';
    const org = rec.sequence_record?.organism ? formatOrganism(rec.sequence_record.organism) : 'N/A';
    const len = rec.analyzed_length || rec.total_sequence_length || 0;
    const unit = rec.sequence_type === 'PROTEIN' ? 'aa' : 'bp';
    const source = rec._is_local_fallback ? 'Local Storage' : 'Supabase Cloud';
    const dateStr = new Date(rec.created_at).toLocaleDateString();

    return [
      String(idx + 1),
      rec.analysis_type,
      acc,
      org,
      rec.sequence_type || 'DNA',
      `${len.toLocaleString()} ${unit}`,
      source,
      rec.status,
      dateStr
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Analysis Pipeline', 'Sequence / Accession', 'Organism', 'Type', 'Analyzed Length', 'Storage Backend', 'Status', 'Date']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: COLORS.primaryDark,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      lineColor: COLORS.borderLight,
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 38, fontStyle: 'bold', textColor: COLORS.primary },
      3: { cellWidth: 45, fontStyle: 'italic' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 28 },
      6: { cellWidth: 32 },
      7: { cellWidth: 22, halign: 'center', textColor: COLORS.emerald, fontStyle: 'bold' },
      8: { cellWidth: 22, halign: 'right' }
    },
    margin: { left: margin, right: margin }
  });

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 10, pageWidth - 14, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slateMedium);
    doc.text('BioCode Studio Genomic Audit History Summary • Confidential — For Scientific & Research Use Only', 14, pageHeight - 6);

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  doc.save(`BioCode_Audit_History_Summary_${now.toISOString().slice(0, 10)}.pdf`);
}
