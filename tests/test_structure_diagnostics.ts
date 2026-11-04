import { diagnoseStructurePipeline } from '../src/lib/bio/structure3d/structureDiagnostics';

async function runDiagnosticTests() {
  console.log('--- Testing Structure Diagnostics Utility ---');

  // Test Case 1: PDB Structure Target ID (1TUP)
  console.log('\n[Test 1] Tracing PDB Target "1TUP"...');
  const report1 = await diagnoseStructurePipeline({
    targetId: '1TUP',
    sequence: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
    sequenceType: 'PROTEIN'
  });

  console.log('Result 1 Summary:', {
    targetId: report1.targetId,
    source: report1.retrievalSource,
    renderingReady: report1.renderingReady,
    totalAtoms: report1.coordinateValidation.totalAtoms,
    nonFiniteAtoms: report1.coordinateValidation.nonFiniteAtomsCount,
    mappedResidues: report1.residueMappingReport.mappedResiduesCount,
    coveragePercent: report1.residueMappingReport.coveragePercent,
    mismatchesCount: report1.residueMappingReport.mismatches.length,
    rcsbSummary: report1.rawResponseSummary.rcsbSummary
  });

  // Test Case 2: NCBI RefSeq Accession (NP_000537.3)
  console.log('\n[Test 2] Tracing NCBI Target "NP_000537"...');
  const report2 = await diagnoseStructurePipeline({
    targetId: 'NP_000537',
    sequence: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
    sequenceType: 'PROTEIN',
    mutations: [
      { id: 'm1', position: 248, original: 'R', modified: 'W', operation: 'substitution', lengthChange: 0, timestamp: new Date().toISOString() },
      { id: 'm2', position: 500, original: 'A', modified: 'E', operation: 'substitution', lengthChange: 0, timestamp: new Date().toISOString() } // Position 500 is beyond sequence length
    ]
  });

  console.log('Result 2 Summary:', {
    targetId: report2.targetId,
    source: report2.retrievalSource,
    renderingReady: report2.renderingReady,
    totalAtoms: report2.coordinateValidation.totalAtoms,
    nonFiniteAtoms: report2.coordinateValidation.nonFiniteAtomsCount,
    coveragePercent: report2.residueMappingReport.coveragePercent,
    unmappedMutations: report2.residueMappingReport.unmappedMutations,
    ncbiSummary: report2.rawResponseSummary.ncbiSummary
  });

  console.log('\n--- All Diagnostic Tests Passed! ---');
}

runDiagnosticTests().catch((err) => {
  console.error('Diagnostic test failed:', err);
  process.exit(1);
});
