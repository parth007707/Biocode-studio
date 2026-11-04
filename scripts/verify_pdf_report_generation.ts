import { generateScientificPdfReport } from '../src/utils/pdfReportGenerator';
import { generateAnalysisReportPdf, generateBatchSummaryReportPdf } from '../src/services/pdfReportService';
import { AnalysisRecord } from '../src/types';

async function runPdfVerificationTests() {
  console.log('================================================================');
  console.log('  BioCode Studio — Research Report PDF Generation Audit Test    ');
  console.log('================================================================\n');

  // Test 1: Standard Wild-Type DNA Report Generation
  console.log('[1] Testing Wild-Type DNA PDF Report Generation...');
  const dnaDoc = generateScientificPdfReport({
    accession: 'NC_000001_TEST',
    definition: 'Homo sapiens chromosome 1 test region',
    organism: 'Homo sapiens',
    sequence: 'ATGCGATCGATCGATCGATCGATCGATCGAATGCGATCGATCGA',
    originalSequence: 'ATGCGATCGATCGATCGATCGATCGATCGAATGCGATCGATCGA',
    sequenceType: 'DNA',
    versionNumber: 1,
    isModified: false,
    mutations: [],
    analysisResults: {
      dnaAnalysis: {
        composition: {
          length: 44,
          counts: { A: 12, T: 12, G: 10, C: 10 },
          gcCount: 20,
          atCount: 24,
          gcPercentage: 45.45,
          atPercentage: 54.55
        },
        orfs: [
          { frame: 1, start: 1, end: 42, lengthBp: 42, lengthAa: 14, proteinSequence: 'MRSIRDRIEMRSI' }
        ],
        longestOrf: { frame: 1, start: 1, end: 42, lengthBp: 42, lengthAa: 14, proteinSequence: 'MRSIRDRIEMRSI' }
      },
      interpretation: {
        title: 'DNA Analysis Interpretation',
        executiveSummary: 'Canonical DNA sequence with 45.45% GC content and 1 identified coding frame.',
        biophysicalInsights: ['Balanced GC/AT ratio', 'Coding potential detected in Frame +1'],
        structuralImplications: ['B-DNA helical conformation predicted'],
        functionalPredictions: ['Standard promoter/exon candidate']
      }
    } as any,
    projectName: 'Oncology Targets Project'
  });

  const dnaArrayBuffer = dnaDoc.output('arraybuffer');
  const dnaBuffer = Buffer.from(dnaArrayBuffer);
  const dnaPdfHeader = dnaBuffer.toString('utf8', 0, 8);
  console.log(`    - Output Buffer Size: ${dnaBuffer.length} bytes`);
  console.log(`    - PDF Header Signature: ${dnaPdfHeader.trim()}`);

  if (!dnaPdfHeader.startsWith('%PDF-')) {
    console.error('FAILED: Generated document is not a valid PDF file.');
    process.exit(1);
  }

  // Test 2: Mutated Protein PDF Report Generation (with Original vs Modified & Structure Limitations)
  console.log('\n[2] Testing Mutated Protein PDF Report with Structure & Mutation Comparison...');
  const origProtein = 'MKTLLILAVVCAAALAAPAQAEPEVKYTYNYEAGKVKYTYNYE';
  const modProtein  = 'MKTLLILAVVCAAALAGPAQAEPEVKYTYNYEAGKVKYTYNYE'; // 1 mutation at pos 17 (A -> G)

  const protDoc = generateScientificPdfReport({
    accession: 'P01308_MUTATED',
    definition: 'Human insulin precursor mutant variant',
    organism: 'Homo sapiens',
    sequence: modProtein,
    originalSequence: origProtein,
    sequenceType: 'PROTEIN',
    versionNumber: 2,
    isModified: true,
    mutations: [
      {
        id: 'mut-1',
        operation: 'substitution',
        position: 17,
        original: 'A',
        modified: 'G',
        lengthChange: 0,
        timestamp: new Date().toISOString(),
        description: 'Position 17: Ala → Gly (A17G)'
      }
    ],
    analysisResults: {
      proteinAnalysis: {
        length: 43,
        molecularWeightDa: 4682.3,
        molecularWeightKDa: '4.68',
        isoelectricPoint: '5.21',
        netChargeAtPh7: -2.1,
        gravyScore: '-0.12',
        extinctionCoefficient: 5500,
        polarPercentage: 32.5,
        hydrophobicPercentage: 41.8,
        predictedSecondaryStructure: {
          dominantConformation: 'Alpha Helix',
          helixPropensity: '42%',
          sheetPropensity: '18%'
        }
      },
      interpretation: {
        title: 'Protein Variant Interpretation',
        executiveSummary: 'Substituted Ala17Gly in signal peptide transition region. Maintains overall fold with slight backbone flexibility.',
        biophysicalInsights: ['Isoelectric point pI 5.21 indicates acidic protein', 'A17G mutation increases local flexibility'],
        structuralImplications: ['Alpha-helical propensity preserved'],
        functionalPredictions: ['Secretion signal processing unaffected']
      }
    } as any,
    structureInfo: {
      source: 'BioCode Procedural / AlphaFold Homology Prediction Engine',
      method: '3D Secondary & Tertiary Backbone Conformational Folding Algorithm',
      limitations: 'PREDICTED / PARTIAL IN-SILICO MODEL — NOT EXPERIMENTALLY VERIFIED BY X-RAY CRYSTALLOGRAPHY OR CRYO-EM. Intended for qualitative research assessment only.',
      isPredicted: true,
      isPartial: true
    },
    projectName: 'Variant Impact Study'
  });

  const protBuffer = Buffer.from(protDoc.output('arraybuffer'));
  console.log(`    - Output Buffer Size: ${protBuffer.length} bytes`);
  console.log(`    - Valid PDF Signature: ${protBuffer.toString('utf8', 0, 8).trim()}`);

  // Test 3: Long Sequence Performance Test (e.g. 100,000 bp chromosome sequence)
  console.log('\n[3] Testing Performance & Safety with Large Sequence (100,000 bp)...');
  const longSeqChunk = 'ATGCGATCGATCGATCGATCGATCGATCGATCGA';
  const longSequence = longSeqChunk.repeat(3000); // ~102,000 bp

  const startTime = Date.now();
  const longDoc = generateScientificPdfReport({
    accession: 'NC_000001_LARGE_GENOME',
    definition: 'Homo sapiens chromosome 1 large genomic region',
    organism: 'Homo sapiens',
    sequence: longSequence,
    originalSequence: longSequence,
    sequenceType: 'DNA',
    versionNumber: 1,
    isModified: false,
    mutations: [],
    projectName: 'Large Genome Benchmark'
  });
  const durationMs = Date.now() - startTime;

  const longBuffer = Buffer.from(longDoc.output('arraybuffer'));
  console.log(`    - Large Sequence Length: ${longSequence.length.toLocaleString()} bp`);
  console.log(`    - PDF Generation Time: ${durationMs} ms`);
  console.log(`    - Output Buffer Size: ${longBuffer.length} bytes`);

  if (durationMs > 3000) {
    console.error(`FAILED: Large sequence PDF generation took too long (${durationMs} ms). Must be under 3000 ms.`);
    process.exit(1);
  }

  // Test 4: Testing pdfReportService Analysis Record PDF Generator
  console.log('\n[4] Testing pdfReportService generateAnalysisReportPdf...');
  const mockRecord: AnalysisRecord = {
    id: 'ana-test-uuid-123456789',
    user_id: 'user-123',
    sequence_id: 'seq-123',
    project_id: 'proj-123',
    analysis_type: 'Complete GC & 6-Frame ORF Analysis',
    analysis_scope: 'Complete Sequence',
    total_sequence_length: 100,
    analyzed_length: 100,
    sequence_type: 'DNA',
    input_source: 'NCBI: NC_000001',
    status: 'Completed',
    result_summary: 'GC Content: 50.0%',
    results: {
      dnaAnalysis: {
        composition: {
          length: 100,
          counts: { A: 25, T: 25, G: 25, C: 25 },
          gcCount: 50,
          atCount: 50,
          gcPercentage: 50,
          atPercentage: 50
        },
        orfs: []
      }
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sequence_record: {
      id: 'seq-123',
      user_id: 'user-123',
      source: 'NCBI',
      accession: 'NC_000001',
      organism: 'Homo sapiens',
      molecule_type: 'DNA',
      sequence_type: 'Genomic DNA',
      definition: 'Homo sapiens chromosome 1 test record',
      total_length: 100,
      topology: 'linear',
      sequence: 'ATGC'.repeat(25),
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    _is_local_fallback: false
  };

  await generateAnalysisReportPdf(mockRecord, { fullSequence: 'ATGC'.repeat(25) });
  console.log('    - generateAnalysisReportPdf completed successfully.');

  // Test 5: Testing Batch Summary PDF Generator
  console.log('\n[5] Testing pdfReportService generateBatchSummaryReportPdf...');
  await generateBatchSummaryReportPdf([mockRecord], 'BioCode Audit Log Export Test');
  console.log('    - generateBatchSummaryReportPdf completed successfully.');

  console.log('\n================================================================');
  console.log('  ALL RESEARCH REPORT PDF GENERATION TESTS PASSED!              ');
  console.log('================================================================');
}

runPdfVerificationTests().catch(err => {
  console.error('Unhandled exception during PDF report generation test:', err);
  process.exit(1);
});
