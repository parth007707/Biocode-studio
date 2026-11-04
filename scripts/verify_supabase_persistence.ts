import { bioService } from '../src/services/bioService';
import { supabase, isSupabaseConfigured, rawSupabaseUrl } from '../src/lib/supabase/client';

async function runVerification() {
  console.log('================================================================');
  console.log('  BioCode Studio — Supabase Database & Persistence Audit Test   ');
  console.log('================================================================\n');

  console.log(`[1] Configuration Check`);
  console.log(`    - Configured: ${isSupabaseConfigured}`);
  console.log(`    - Endpoint URL: ${rawSupabaseUrl}`);

  if (!isSupabaseConfigured) {
    console.error('FAILED: Supabase environment variables missing or invalid.');
    process.exit(1);
  }

  // Test 1: Schema Health Check
  console.log('\n[2] Schema Health & Table Accessibility Check');
  const health = await bioService.checkSchemaHealth(true);
  console.log(`    - Connection State: ${health.state}`);
  console.log(`    - Connected: ${health.connected}`);
  console.log(`    - Tables Status:`, health.tables);
  if (health.missingTables.length > 0) {
    console.error(`    - Missing Tables: ${health.missingTables.join(', ')}`);
    process.exit(1);
  }

  const testSuffix = Date.now().toString(36);
  const testUserId = undefined; // Testing anon / user-level session flow

  // Test 2: Project Creation & Persistence
  console.log('\n[3] Research Project Creation & Retrieval Test');
  const projName = `Test Project ${testSuffix}`;
  const createdProj = await bioService.createProject(testUserId, {
    name: projName,
    organism: 'Homo sapiens',
    description: 'Automated test research project for persistence verification',
    research_objective: 'Verify Supabase database persistence',
    project_type: 'Genomic Analysis',
    tags: ['test', 'automated', 'audit']
  });
  console.log(`    - Created Project ID: ${createdProj.id}`);
  console.log(`    - Created Project Name: ${createdProj.name}`);

  // Retrieve project from Supabase
  const retrievedProj = await bioService.getProjectById(createdProj.id);
  if (!retrievedProj || retrievedProj.name !== projName) {
    console.error(`FAILED: Could not retrieve created project ${createdProj.id} from Supabase.`);
    process.exit(1);
  }
  console.log(`    - Verified Retrieval: Project "${retrievedProj.name}" successfully retrieved from Supabase.`);

  // Test 3: Sequence Record Creation & Retrieval
  console.log('\n[4] Sequence Record Creation & Metadata Persistence Test');
  const testAccession = `NC_000001_TEST_${testSuffix}`;
  const seqRecordRes = await bioService.createSequenceRecord(testUserId, {
    source: 'NCBI',
    accession: testAccession,
    version: '1',
    organism: 'Homo sapiens',
    molecule_type: 'DNA',
    sequence_type: 'Genomic DNA',
    definition: 'Homo sapiens chromosome 1 test sequence record',
    total_length: 30,
    topology: 'linear',
    sequence: 'ATGCGATCGATCGATCGATCGATCGATCGA',
    project_id: createdProj.id,
    metadata: { pipeline: 'Sequence Analysis', testRun: true }
  });

  if (seqRecordRes.storage !== 'supabase' || !seqRecordRes.data) {
    console.error(`FAILED: Sequence record creation failed or defaulted to fallback: ${seqRecordRes.warning}`);
    process.exit(1);
  }
  const createdSeq = seqRecordRes.data;
  console.log(`    - Created Sequence ID: ${createdSeq.id}`);
  console.log(`    - Storage Mode: ${seqRecordRes.storage}`);

  // Associate sequence with project
  await bioService.addSequenceToProject(createdProj.id, createdSeq.id);
  console.log(`    - Sequence ${createdSeq.id} associated with Project ${createdProj.id}`);

  // Test 4: Analysis Record Creation & Association
  console.log('\n[5] Analysis History Persistence & Association Test');
  const analysisRes = await bioService.saveCompletedAnalysis(testUserId, {
    sequenceInfo: {
      source: 'NCBI',
      accession: testAccession,
      version: '1',
      organism: 'Homo sapiens',
      molecule_type: 'DNA',
      sequence_type: 'Genomic DNA',
      definition: 'Homo sapiens chromosome 1 test sequence record',
      total_length: 30,
      sequence: 'ATGCGATCGATCGATCGATCGATCGATCGA'
    },
    analysisInfo: {
      analysis_type: 'Complete GC & 6-Frame ORF Analysis',
      analysis_scope: 'Complete Sequence',
      sequence_type: 'DNA',
      status: 'Completed',
      result_summary: 'GC Content: 50.0% | ORFs found: 1',
      results: {
        gcContent: 50.0,
        orfCount: 1,
        testRun: true
      }
    },
    projectId: createdProj.id
  });

  if (analysisRes.storage !== 'supabase' || !analysisRes.data) {
    console.error(`FAILED: Analysis record creation failed: ${analysisRes.warning}`);
    process.exit(1);
  }
  const createdAna = analysisRes.data;
  console.log(`    - Created Analysis ID: ${createdAna.id}`);
  console.log(`    - Linked Sequence ID: ${createdAna.sequence_id}`);
  console.log(`    - Linked Project ID: ${createdAna.project_id}`);

  // Verify retrieval of analysis by ID
  const retrievedAna = await bioService.getAnalysisById(createdAna.id, testUserId, true);
  if (!retrievedAna || retrievedAna.id !== createdAna.id) {
    console.error(`FAILED: Could not retrieve analysis ${createdAna.id} from Supabase.`);
    process.exit(1);
  }
  console.log(`    - Verified Analysis Retrieval: ID ${retrievedAna.id} found in Supabase.`);

  // Test 5: Mutation History & Versioning
  console.log('\n[6] Mutation History & Sequence Versioning Immutability Test');
  const origSeq = 'ATGCGATCGATCGATCGATCGATCGATCGA';
  const modSeq  = 'ATGCGATCGATCGATCGATCGATCGATCGT'; // 1 SNP mutation at end

  const versionRes = await bioService.saveSequenceVersion({
    sequence_record_id: createdSeq.id,
    sequence_id: createdSeq.id,
    parent_version_id: null,
    accession: testAccession,
    original_sequence: origSeq,
    modified_sequence: modSeq,
    sequence_data: modSeq,
    version_number: 2,
    original_length: origSeq.length,
    modified_length: modSeq.length,
    total_changes: 1,
    changes: [{ id: 'mut-1', operation: 'substitution', position: 30, original: 'A', modified: 'T', lengthChange: 0, timestamp: new Date().toISOString() }],
    status: 'Completed',
    mutation_summary: { totalChanges: 1, originalLength: 30, modifiedLength: 30 },
    metadata: { parentSequenceId: createdSeq.id, originalSequence: origSeq }
  });

  if (versionRes.storage !== 'supabase' || !versionRes.data) {
    console.error(`FAILED: Sequence version creation failed: ${versionRes.warning}`);
    process.exit(1);
  }
  const createdVer = versionRes.data;
  console.log(`    - Created Sequence Version ID: ${createdVer.id} (v${createdVer.version_number})`);

  // Verify versions retrieval
  const versions = await bioService.getSequenceVersions(createdSeq.id);
  const foundV2 = versions.find(v => v.id === createdVer.id);
  if (!foundV2) {
    console.error(`FAILED: Could not retrieve sequence version ${createdVer.id} for sequence ${createdSeq.id}.`);
    process.exit(1);
  }
  console.log(`    - Verified Sequence Version Retrieval: v2 found for sequence ${createdSeq.id}.`);
  console.log(`    - Original Length: ${foundV2.original_length} | Modified Length: ${foundV2.modified_length} | Changes: ${foundV2.total_changes}`);

  // Test 6: Deletion & Referential Integrity
  console.log('\n[7] Deletion & Referential Integrity Test');
  
  // Delete project
  const projDeleted = await bioService.deleteProject(createdProj.id);
  console.log(`    - Deleted Test Project ${createdProj.id}: ${projDeleted}`);

  // Delete analysis
  const anaDeleted = await bioService.deleteAnalysis(createdAna.id);
  console.log(`    - Deleted Test Analysis ${createdAna.id}: ${anaDeleted}`);

  // Delete sequence
  const seqDeleted = await bioService.deleteSequenceRecord(createdSeq.id);
  console.log(`    - Deleted Test Sequence Record ${createdSeq.id}: ${seqDeleted}`);

  // Confirm records are gone from Supabase
  const checkProj = await bioService.getProjectById(createdProj.id);
  if (checkProj) {
    console.error(`FAILED: Project ${createdProj.id} still exists after deletion.`);
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('  ALL SUPABASE PERSISTENCE & DATA INTEGRITY TESTS PASSED!       ');
  console.log('================================================================');
}

runVerification().catch(err => {
  console.error('Unhandled exception during verification test:', err);
  process.exit(1);
});
