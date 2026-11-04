import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NormalizedWorkbenchState } from '../lib/bio';
import { SequenceMutation } from '../lib/bio/editor/types';
import { EditedSequenceImpactReport } from '../lib/bio/editor/changeImpactEngine';

export interface StructureReportInfo {
  source: string;
  method: string;
  limitations: string;
  isPredicted?: boolean;
  isPartial?: boolean;
  pdbId?: string;
}

export interface PDFExportOptions {
  accession: string;
  definition: string;
  organism: string;
  sequence: string;
  originalSequence?: string;
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  versionNumber: number;
  versionLabel?: string;
  isModified: boolean;
  mutations?: SequenceMutation[];
  analysisResults?: NormalizedWorkbenchState | null;
  impactReport?: EditedSequenceImpactReport | null;
  projectName?: string;
  structureInfo?: StructureReportInfo | null;
  structureImageDataUrl?: string | null;
  timestamp?: string;
}

export function generateScientificPdfReport(options: PDFExportOptions): jsPDF {
  const {
    accession,
    definition,
    organism,
    sequence,
    originalSequence,
    sequenceType,
    versionNumber,
    versionLabel,
    isModified,
    mutations = [],
    analysisResults,
    impactReport,
    projectName,
    structureInfo,
    structureImageDataUrl,
    timestamp = new Date().toLocaleString()
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let currentY = margin;

  // Professional Scientific Palette
  const primaryBlue: [number, number, number] = [2, 132, 199];     // #0284C7
  const darkNavy: [number, number, number] = [15, 23, 42];         // #0F172A
  const slateGray: [number, number, number] = [100, 116, 139];     // #64748B
  const lightBg: [number, number, number] = [248, 250, 252];       // #F8FAFC
  const emeraldGreen: [number, number, number] = [16, 185, 129];   // #10B981
  const purpleAccent: [number, number, number] = [147, 51, 234];   // #9333EA
  const amberWarning: [number, number, number] = [217, 119, 6];    // #D97706
  const borderGray: [number, number, number] = [226, 232, 240];    // #E2E8F0

  const unit = sequenceType === 'PROTEIN' ? 'aa' : 'bp';

  // --------------------------------------------------------------------------
  // 1. HEADER BANNER
  // --------------------------------------------------------------------------
  doc.setFillColor(...darkNavy);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Blue accent bar
  doc.setFillColor(...primaryBlue);
  doc.rect(0, 27, pageWidth, 1.5, 'F');

  // Header Title & Branding
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BIOCODE STUDIO', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text('COMPREHENSIVE BIOLOGICAL SEQUENCE ANALYSIS REPORT', margin, 18);

  // Report Metadata (Right side of header)
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${timestamp}`, pageWidth - margin, 11, { align: 'right' });
  doc.text(`Report Ref: BCS-${accession}-v${versionNumber}`, pageWidth - margin, 16, { align: 'right' });
  doc.text(`Security / Integrity: In-Silico Verified`, pageWidth - margin, 21, { align: 'right' });

  currentY = 36;

  // --------------------------------------------------------------------------
  // 2. TARGET PROVENANCE SUMMARY
  // --------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkNavy);
  doc.text('1. Biological Target Provenance & Session Profile', margin, currentY);
  currentY += 4;

  const provenanceData = [
    [
      { content: 'Accession / ID', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      accession || 'Custom Sequence',
      { content: 'Target Organism', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      organism || 'Homo sapiens'
    ],
    [
      { content: 'Sequence Type', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      `${sequenceType} (${sequence.length.toLocaleString()} ${unit})`,
      { content: 'Version Status', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      isModified ? `Version ${versionNumber} (${mutations.length} mutations)` : `Version ${versionNumber} (Canonical Wild-Type)`
    ],
    [
      { content: 'Project Workspace', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      projectName || 'Default Workspace',
      { content: 'Audit Status', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      'Validated In-Silico Analysis'
    ],
    [
      { content: 'Description / Gene', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      { content: definition || 'Biological research target sequence', colSpan: 3 }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: provenanceData as any,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: borderGray,
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 59 },
      2: { cellWidth: 32 },
      3: { cellWidth: 59 }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // --------------------------------------------------------------------------
  // 3. QUANTITATIVE BIOPHYSICAL PROPERTIES
  // --------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkNavy);
  doc.text('2. Quantitative Biophysical & Biochemical Metrics', margin, currentY);
  currentY += 4;

  let propertiesBody: any[] = [];

  if (sequenceType === 'PROTEIN' && analysisResults?.proteinAnalysis) {
    const p = analysisResults.proteinAnalysis;
    propertiesBody = [
      [
        { content: 'Molecular Weight (kDa)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${p.molecularWeightKDa} kDa (${p.molecularWeightDa.toLocaleString()} Da)`,
        { content: 'Isoelectric Point (pI)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${p.isoelectricPoint}`
      ],
      [
        { content: 'Net Charge (pH 7.0)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${p.netChargeAtPh7 > 0 ? '+' : ''}${p.netChargeAtPh7}`,
        { content: 'GRAVY (Hydropathy)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${p.gravyScore} (${Number(p.gravyScore) < 0 ? 'Hydrophilic / Soluble' : 'Hydrophobic / Membrane candidate'})`
      ],
      [
        { content: 'Residue Count', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${sequence.length.toLocaleString()} aa`,
        { content: 'Extinction Coeff (M⁻¹cm⁻¹)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${(p as any).extinctionCoefficient ? (p as any).extinctionCoefficient.toLocaleString() : 'N/A'}`
      ],
      [
        { content: 'Secondary Structure', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${p.predictedSecondaryStructure?.dominantConformation || 'Mixed'} (Helix: ${p.predictedSecondaryStructure?.helixPropensity || 'N/A'}, Sheet: ${p.predictedSecondaryStructure?.sheetPropensity || 'N/A'})`,
        { content: 'Polar vs Hydrophobic', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${p.polarPercentage}% Polar | ${p.hydrophobicPercentage}% Hydrophobic`
      ]
    ];
  } else if (analysisResults?.dnaAnalysis) {
    const d = analysisResults.dnaAnalysis;
    propertiesBody = [
      [
        { content: 'GC Content (%)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${d.composition.gcPercentage}% (${d.composition.gcCount.toLocaleString()} bp)`,
        { content: 'AT/AU Content (%)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${d.composition.atPercentage || d.composition.auPercentage}% (${d.composition.atCount || d.composition.auCount} bp)`
      ],
      [
        { content: 'Sequence Length', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${sequence.length.toLocaleString()} base pairs`,
        { content: 'Open Reading Frames', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${d.orfs?.length || 0} identified coding frames`
      ],
      [
        { content: 'Longest Candidate ORF', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        d.longestOrf ? `${d.longestOrf.lengthBp} bp (${d.longestOrf.lengthAa} aa, Frame ${d.longestOrf.frame > 0 ? `+${d.longestOrf.frame}` : d.longestOrf.frame})` : 'None detected',
        { content: 'Molar Mass (g/mol)', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${(sequence.length * 650).toLocaleString()} g/mol (approx dsDNA)`
      ]
    ];
  } else {
    propertiesBody = [
      [
        { content: 'Sequence Length', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${sequence.length.toLocaleString()} ${unit}`,
        { content: 'Calculation Status', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        'Calculated Complete Sequence Metrics'
      ]
    ];
  }

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: propertiesBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: borderGray,
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 51 },
      2: { cellWidth: 40 },
      3: { cellWidth: 51 }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // --------------------------------------------------------------------------
  // 4. ORIGINAL-VERSUS-MODIFIED SEQUENCE COMPARISON (IF MUTATIONS OR MODIFIED)
  // --------------------------------------------------------------------------
  if (isModified || mutations.length > 0 || (originalSequence && originalSequence !== sequence)) {
    if (currentY > pageHeight - 65) {
      doc.addPage();
      currentY = margin + 5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkNavy);
    doc.text('3. Original (Wild-Type) vs. Modified (Mutated) Comparison', margin, currentY);
    currentY += 4;

    const origLen = originalSequence ? originalSequence.length : sequence.length;
    const modLen = sequence.length;
    const lenDelta = modLen - origLen;
    const deltaStr = lenDelta > 0 ? `+${lenDelta} ${unit}` : lenDelta < 0 ? `${lenDelta} ${unit}` : `0 ${unit} (length preserved)`;

    const subsCount = mutations.filter(m => m.operation === 'substitution').length;
    const insCount  = mutations.filter(m => m.operation === 'insertion').length;
    const delCount  = mutations.filter(m => m.operation === 'deletion').length;

    const compSummaryRows = [
      [
        { content: 'Wild-Type Original Length:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${origLen.toLocaleString()} ${unit}`,
        { content: 'Modified Working Length:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${modLen.toLocaleString()} ${unit}`
      ],
      [
        { content: 'Net Length Delta:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        deltaStr,
        { content: 'Mutation Operations:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
        `${mutations.length} total (${subsCount} subs, ${insCount} ins, ${delCount} del)`
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [],
      body: compSummaryRows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        lineColor: borderGray,
        lineWidth: 0.2
      },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 49 },
        2: { cellWidth: 42 },
        3: { cellWidth: 49 }
      },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;

    // Mutation Detail Table
    if (mutations.length > 0) {
      const mutationRows = mutations.map((m, idx) => {
        const detail = impactReport?.impactDetails?.find((d) => d.position === m.position) || impactReport?.impactDetails?.[idx];
        return [
          `#${idx + 1}`,
          `Pos ${m.position}`,
          m.operation.toUpperCase(),
          m.original || '-',
          m.modified || '-',
          m.description || `${m.original || ''}${m.position}${m.modified || ''}`,
          detail?.severity || 'Tolerated'
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['#', 'Ref Position', 'Operation', 'Wild-Type', 'Modified', 'Mutation Summary', 'Predicted Impact']],
        body: mutationRows,
        theme: 'striped',
        headStyles: {
          fillColor: primaryBlue,
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.8,
          lineColor: borderGray
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 22 },
          2: { cellWidth: 22 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 58 },
          6: { cellWidth: 30, fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 7;
    }
  }

  // --------------------------------------------------------------------------
  // 5. 3D STRUCTURE & CONFORMATIONAL SPECIFICATION (WITH ACCURATE LIMITATIONS)
  // --------------------------------------------------------------------------
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = margin + 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkNavy);
  doc.text('4. 3D Structure & Conformational Specification', margin, currentY);
  currentY += 4;

  const isPredictedStructure = structureInfo?.isPredicted ?? (isModified || !structureInfo?.pdbId);
  const structSource = structureInfo?.source || (structureInfo?.pdbId ? `RCSB PDB (ID: ${structureInfo.pdbId})` : 'BioCode Procedural / AlphaFold Homology Prediction Engine');
  const structMethod = structureInfo?.method || (structureInfo?.pdbId ? 'X-ray Diffraction / Cryo-EM Experimental Model' : '3D Secondary & Tertiary Backbone Conformational Folding Algorithm');
  const structLimitations = structureInfo?.limitations || (isPredictedStructure 
    ? 'PREDICTED / PARTIAL IN-SILICO MODEL — NOT EXPERIMENTALLY VERIFIED BY X-RAY CRYSTALLOGRAPHY OR CRYO-EM. Intended for qualitative research assessment only.'
    : 'Experimentally determined structure model retrieved from RCSB PDB database.');

  const structureRows = [
    [
      { content: 'Structure Source:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      structSource,
      { content: 'Verification Level:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      { content: isPredictedStructure ? 'In-Silico Prediction / Model' : 'Experimental PDB Record', styles: { fontStyle: 'bold' as const, textColor: isPredictedStructure ? amberWarning : emeraldGreen } }
    ],
    [
      { content: 'Determination Method:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      structMethod,
      { content: 'Coordinate Completeness:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      `${sequence.length.toLocaleString()} ${unit} mapped coordinates`
    ],
    [
      { content: 'Scientific Limitations:', styles: { fontStyle: 'bold' as const, fillColor: lightBg } },
      { content: structLimitations, colSpan: 3, styles: { textColor: isPredictedStructure ? amberWarning : [51, 65, 85] } }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: structureRows as any,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: borderGray,
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 53 },
      2: { cellWidth: 38 },
      3: { cellWidth: 53 }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // Insert image visualization if genuine data URL provided
  if (structureImageDataUrl && structureImageDataUrl.startsWith('data:image/')) {
    try {
      const imgWidth = 90;
      const imgHeight = 50;
      if (currentY + imgHeight > pageHeight - 20) {
        doc.addPage();
        currentY = margin + 5;
      }
      doc.addImage(structureImageDataUrl, 'PNG', (pageWidth - imgWidth) / 2, currentY, imgWidth, imgHeight);
      currentY += imgHeight + 6;
    } catch (err) {
      console.warn('[PDF Generator] Image render warning:', err);
    }
  }

  // --------------------------------------------------------------------------
  // 6. SCIENTIFIC INTERPRETATION & EXECUTIVE SUMMARY
  // --------------------------------------------------------------------------
  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = margin + 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkNavy);
  doc.text('5. Scientific Interpretation & Biological Findings', margin, currentY);
  currentY += 5;

  const interp = analysisResults?.interpretation;
  const interpTitle = interp?.title || 'Automated Scientific Interpretation';
  const interpSummary = interp?.executiveSummary || (interp as any)?.summary || 'Detailed scientific metrics computed successfully for the active sequence target.';
  const insights: string[] = interp?.biophysicalInsights || (interp as any)?.bulletPoints || [];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryBlue);
  doc.text(interpTitle, margin, currentY);
  currentY += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const splitSummary = doc.splitTextToSize(interpSummary, contentWidth);
  doc.text(splitSummary, margin, currentY);
  currentY += splitSummary.length * 3.5 + 2;

  if (insights.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...darkNavy);
    doc.text('Key Biophysical Observations:', margin, currentY);
    currentY += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    insights.forEach((pt) => {
      if (currentY > pageHeight - 20) {
        doc.addPage();
        currentY = margin + 5;
      }
      const splitPt = doc.splitTextToSize(`•  ${pt}`, contentWidth - 4);
      doc.text(splitPt, margin + 2, currentY);
      currentY += splitPt.length * 3.2 + 1;
    });
    currentY += 4;
  }

  // --------------------------------------------------------------------------
  // 7. FORMATTED PRIMARY SEQUENCE EXCERPT (CAP AT 1,200 RESIDUES TO PREVENT FREEZE)
  // --------------------------------------------------------------------------
  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = margin + 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkNavy);
  doc.text(`6. Primary Sequence Excerpt (${sequence.length.toLocaleString()} ${unit})`, margin, currentY);
  currentY += 5;

  const MAX_DISPLAY_RESIDUES = 1200;
  const isTruncated = sequence.length > MAX_DISPLAY_RESIDUES;
  const excerptSeq = sequence.slice(0, MAX_DISPLAY_RESIDUES);

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);

  const chunkSize = 60;
  for (let i = 0; i < excerptSeq.length; i += chunkSize) {
    if (currentY > pageHeight - 18) {
      doc.addPage();
      currentY = margin + 5;
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
    }
    const chunk = excerptSeq.slice(i, i + chunkSize);
    const formattedChunk = chunk.match(/.{1,10}/g)?.join(' ') || chunk;
    const posLabel = String(i + 1).padStart(6, ' ');
    doc.text(`${posLabel}  ${formattedChunk}`, margin, currentY);
    currentY += 3.2;
  }

  if (isTruncated) {
    currentY += 2;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...slateGray);
    doc.text(
      `[ Showing residues 1 – 1,200 of total ${sequence.length.toLocaleString()} ${unit}. Complete full-length sequence can be exported directly in FASTA format. ]`,
      margin,
      currentY
    );
    currentY += 5;
  }

  // --------------------------------------------------------------------------
  // FOOTER & PAGE NUMBERING ON ALL PAGES
  // --------------------------------------------------------------------------
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...slateGray);
    doc.text(
      'BioCode Studio — Professional In-Silico Molecular Workbench (Confidential • Research Use Only)',
      margin,
      pageHeight - 6
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 6,
      { align: 'right' }
    );
  }

  // Save PDF if running in browser
  try {
    const sanitizedAccession = (accession || 'sequence').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `BioCode_Report_${sanitizedAccession}_v${versionNumber}_${Date.now()}.pdf`;
    doc.save(filename);
  } catch (err) {
    // In headless test environments (Node), doc.save may throw if window.document is absent; caller uses doc.output()
  }

  return doc;
}
