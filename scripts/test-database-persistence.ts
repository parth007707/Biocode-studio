import { supabase, isSupabaseConfigured } from '../src/lib/supabase/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

async function runDatabaseTests() {
  console.log('🧪 Running Supabase Live Database Persistence & Integrity Tests...\n');

  assert(isSupabaseConfigured, 'Supabase client must be configured with valid URL and Anon Key');
  console.log('  ✅ Supabase client initialization verified');

  // Test 1: Project Creation, Verification & Query
  console.log('\nTest 1: Research Project Creation & Retrieval...');
  const testProjectName = `Test Project ${Date.now()}`;
  const { data: createdProject, error: projErr } = await supabase
    .from('projects')
    .insert({
      name: testProjectName,
      organism: 'Homo sapiens',
      description: 'Automated persistence verification project',
      project_type: 'Genomic Analysis',
      status: 'Active'
    })
    .select()
    .single();

  if (projErr) {
    console.error('Project creation failed error:', projErr);
  }
  assert(!projErr && createdProject && createdProject.id, `Failed to create project record: ${projErr?.message}`);
  const projectId = createdProject.id;
  console.log('  ✅ Created project ID:', projectId);

  // Retrieve created project to confirm persistence
  const { data: retrievedProject, error: projGetErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  assert(!projGetErr && retrievedProject && retrievedProject.name === testProjectName, 'Failed to retrieve persisted project from database');
  console.log('  ✅ Persisted project retrieved successfully:', retrievedProject.name);

  // Test 2: Sequence Record Creation & Storage
  console.log('\nTest 2: Sequence Record Creation & Metadata Storage...');
  const testAccession = `TEST_ACC_${Date.now()}`;
  const originalSeq = 'ATGCGTACGTTAGCTAGCTAGCTA';
  const { data: createdSeq, error: seqErr } = await supabase
    .from('sequence_records')
    .insert({
      source: 'Direct Input',
      accession: testAccession,
      version: '1',
      organism: 'Homo sapiens',
      molecule_type: 'DNA',
      sequence_type: 'Genomic DNA',
      definition: 'Persistence Test Sequence Record',
      total_length: originalSeq.length,
      topology: 'linear',
      sequence: originalSeq,
      metadata: { testCreated: true, createdIso: new Date().toISOString() }
    })
    .select()
    .single();

  assert(!seqErr && createdSeq && createdSeq.id, `Failed to create sequence_record: ${seqErr?.message}`);
  const sequenceId = createdSeq.id;
  console.log('  ✅ Created sequence_record ID:', sequenceId);

  // Retrieve created sequence record to confirm persistence
  const { data: retrievedSeq, error: seqGetErr } = await supabase
    .from('sequence_records')
    .select('*')
    .eq('id', sequenceId)
    .single();

  assert(!seqGetErr && retrievedSeq && retrievedSeq.sequence === originalSeq, 'Failed to retrieve persisted sequence_record');
  console.log('  ✅ Persisted sequence record retrieved successfully');

  // Test 3: Project-Sequence Junction Association
  console.log('\nTest 3: Project-Sequence Association Junction (project_sequences)...');
  const { data: createdAssoc, error: assocErr } = await supabase
    .from('project_sequences')
    .insert({
      project_id: projectId,
      sequence_id: sequenceId
    })
    .select()
    .single();

  assert(!assocErr && createdAssoc, `Failed to create project_sequence association: ${assocErr?.message}`);
  console.log('  ✅ Project-Sequence association persisted');

  // Test 4: Analysis Record Creation & Association
  console.log('\nTest 4: Analysis History & Association to Project & Sequence...');
  const { data: createdAnalysis, error: anaErr } = await supabase
    .from('analyses')
    .insert({
      sequence_id: sequenceId,
      project_id: projectId,
      analysis_type: 'Automated Real-Time Intelligence Pipeline',
      analysis_scope: 'Complete Sequence',
      total_sequence_length: originalSeq.length,
      analyzed_length: originalSeq.length,
      sequence_type: 'DNA',
      input_source: 'Manual Input',
      status: 'Completed',
      result_summary: 'Test Analysis Execution Summary',
      results: { gcContent: 50.0, totalBases: originalSeq.length }
    })
    .select()
    .single();

  assert(!anaErr && createdAnalysis && createdAnalysis.id, `Failed to create analysis record: ${anaErr?.message}`);
  const analysisId = createdAnalysis.id;
  console.log('  ✅ Created analysis record ID:', analysisId);

  // Query analysis history for sequence & project
  const { data: retrievedAnalyses, error: anaGetErr } = await supabase
    .from('analyses')
    .select('*')
    .eq('project_id', projectId);

  assert(!anaGetErr && retrievedAnalyses && retrievedAnalyses.length > 0, 'Failed to retrieve analysis history for project');
  console.log('  ✅ Retrived project analysis history count:', retrievedAnalyses.length);

  // Test 5: Sequence Versioning (Original vs Modified Sequence Separation)
  console.log('\nTest 5: Sequence Versioning & Mutation History Separation...');
  const modifiedSeq = 'ATGCGTACGTTAGCTAGCTAGCTA_MUTATED';
  const { data: createdVersion, error: verErr } = await supabase
    .from('sequence_versions')
    .insert({
      sequence_id: sequenceId,
      sequence_record_id: sequenceId,
      accession: testAccession,
      original_sequence: originalSeq,
      modified_sequence: modifiedSeq,
      sequence_data: modifiedSeq,
      version_number: 2,
      original_length: originalSeq.length,
      modified_length: modifiedSeq.length,
      total_changes: 1,
      change_type: 'modification',
      status: 'Completed',
      mutation_summary: { totalChanges: 1, description: 'Test Mutation' }
    })
    .select()
    .single();

  assert(!verErr && createdVersion && createdVersion.id, `Failed to create sequence_version: ${verErr?.message}`);
  const versionId = createdVersion.id;

  // Retrieve version and verify strict separation of original vs modified sequence
  const { data: retrievedVersion, error: verGetErr } = await supabase
    .from('sequence_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  assert(!verGetErr && retrievedVersion, 'Failed to retrieve persisted sequence_version');
  assert(retrievedVersion.original_sequence === originalSeq, 'Original sequence was corrupted in version record!');
  assert(retrievedVersion.modified_sequence === modifiedSeq, 'Modified sequence mismatch in version record!');
  console.log('  ✅ Original sequence baseline in DB:', retrievedVersion.original_sequence);
  console.log('  ✅ Modified sequence version in DB:', retrievedVersion.modified_sequence);

  // Test 6: Clean Deletion & Cascading Behavior Verification
  console.log('\nTest 6: Deletion & Foreign Key Cascading Verification...');
  // Delete project
  const { error: projDelErr } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  assert(!projDelErr, `Failed to delete test project: ${projDelErr?.message}`);

  // Confirm project_sequences junction record was cascaded
  const { data: cascadedAssoc } = await supabase
    .from('project_sequences')
    .select('*')
    .eq('project_id', projectId);

  assert(!cascadedAssoc || cascadedAssoc.length === 0, 'Junction records failed to cascade delete with project!');
  console.log('  ✅ Project deleted and project_sequences junction record cascaded cleanly');

  // Delete sequence record
  const { error: seqDelErr } = await supabase
    .from('sequence_records')
    .delete()
    .eq('id', sequenceId);

  assert(!seqDelErr, `Failed to delete test sequence_record: ${seqDelErr?.message}`);

  // Confirm sequence_versions was cascaded
  const { data: cascadedVersions } = await supabase
    .from('sequence_versions')
    .select('*')
    .eq('sequence_id', sequenceId);

  assert(!cascadedVersions || cascadedVersions.length === 0, 'Sequence versions failed to cascade delete with sequence_record!');
  console.log('  ✅ Sequence record deleted and sequence_versions cascaded cleanly');

  console.log('\n🎉 ALL SUPABASE DATABASE PERSISTENCE & INTEGRITY TESTS PASSED!');
}

runDatabaseTests().catch((e) => {
  console.error('❌ DATABASE TEST EXCEPTION:', e);
  process.exit(1);
});
