import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { requestManager } from '../lib/utils/requestManager';
import { 
  Project, 
  AnalysisRecord, 
  SequenceRecord, 
  SystemStats, 
  SchemaHealthStatus, 
  SupabaseConnectionState,
  SupabaseErrorCategory,
  PersistenceResult,
  SaveCompletedAnalysisInput,
  PendingRecoveryRecord,
  SequenceVersionRecord
} from '../types';
import { dbLogger } from './dbLogger';

function isValidUUID(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback below
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getLocalItem(key: string, defaultValue: string = '[]'): string {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || defaultValue;
    }
  } catch {}
  return defaultValue;
}

function setLocalItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
}

// In-memory cache and in-flight promise for schema health check to eliminate redundant requests and 429 rate limit errors
let cachedHealthStatus: { status: SchemaHealthStatus; timestamp: number } | null = null;
let inFlightHealthCheck: Promise<SchemaHealthStatus> | null = null;
const HEALTH_CACHE_TTL_MS = 30000; // 30 seconds cache

export const bioService = {
  /**
   * Diagnostic method to inspect whether Supabase tables are present in PostgREST schema cache.
   * Uses in-memory caching and in-flight deduplication to prevent rate limit exceeded errors.
   */
  async checkSchemaHealth(forceRefresh: boolean = false): Promise<SchemaHealthStatus> {
    if (!isSupabaseConfigured) {
      console.log('[SUPABASE_HEALTH] Supabase is not configured (missing environment variables).');
      dbLogger.log({
        operation: 'HEALTH_CHECK',
        status: 'FAILED',
        storage: 'local_cache',
        message: 'Supabase URL or Anon Key is unconfigured.',
        error: 'Missing environment variables'
      });
      return {
        state: 'CONFIGURATION_ERROR',
        isConfigured: false,
        connected: false,
        tables: {
          sequence_records: false,
          analyses: false,
          projects: false,
          project_sequences: false,
          sequence_versions: false
        },
        missingTables: ['sequence_records', 'analyses', 'projects', 'sequence_versions'],
        errorCategory: 'MISSING_ENV',
        errorMessage: 'Supabase URL or Anon Key environment variables are missing.',
        checkedAt: new Date().toISOString()
      };
    }

    // Return cached result if fresh and forceRefresh not requested
    if (!forceRefresh && cachedHealthStatus && (Date.now() - cachedHealthStatus.timestamp < HEALTH_CACHE_TTL_MS)) {
      return cachedHealthStatus.status;
    }

    // Return active in-flight request to deduplicate concurrent health checks
    if (inFlightHealthCheck && !forceRefresh) {
      return inFlightHealthCheck;
    }

    inFlightHealthCheck = (async () => {
      const missingTables: string[] = [];
      const tableStatus = {
        sequence_records: false,
        analyses: false,
        projects: false,
        project_sequences: false,
        sequence_versions: false
      };
      let globalError: string | null = null;
      let errorCategory: SchemaHealthStatus['errorCategory'] = undefined;
      let isConnected = false;

      console.log('[SUPABASE_HEALTH] Starting core database schema health check...');

      try {
        const startTime = Date.now();
        const results = await Promise.allSettled([
          supabase.from('sequence_records').select('id').limit(1),
          supabase.from('analyses').select('id').limit(1),
          supabase.from('projects').select('id').limit(1),
          supabase.from('sequence_versions').select('id').limit(1),
          supabase.from('project_sequences').select('project_id').limit(1)
        ]);

        const [seqSettled, anaSettled, projSettled, verSettled, psSettled] = results;

        const checkTableResult = async (res: PromiseSettledResult<any>, name: keyof typeof tableStatus, isRequired: boolean = true) => {
          if (res.status === 'rejected') {
            if (isRequired) missingTables.push(name);
            tableStatus[name] = false;
            if (isRequired) errorCategory = 'NETWORK_FAILURE';
            console.warn(`[SUPABASE_HEALTH] Table ${name} check rejected:`, res.reason);
            return;
          }

          const queryRes = res.value;
          if (queryRes.error) {
            const errMsg = queryRes.error.message || '';
            if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || queryRes.status === 0) {
              tableStatus[name] = false;
              if (isRequired) errorCategory = 'NETWORK_FAILURE';
              console.warn(`[SUPABASE_HEALTH] Table ${name} network error: ${errMsg}`);
            } else if (
              queryRes.error.code === 'PGRST205' || 
              queryRes.error.code === '42P01' || 
              errMsg.includes('schema cache') || 
              errMsg.includes('does not exist')
            ) {
              if (name === 'project_sequences') {
                try {
                  const { error: assocErr } = await supabase.from('analyses').select('project_id, sequence_id').not('project_id', 'is', null).limit(1);
                  if (!assocErr) {
                    tableStatus[name] = true;
                    isConnected = true;
                    console.log(`[SUPABASE_HEALTH] Table ${name} verified via active backend association schema.`);
                    return;
                  }
                } catch {}
              }
              if (isRequired) missingTables.push(name);
              tableStatus[name] = false;
              if (isRequired) errorCategory = 'SCHEMA_MISSING';
              console.warn(`[SUPABASE_HEALTH] Table ${name} missing or not in PostgREST schema cache: ${errMsg}`);
            } else if (queryRes.error.code === '42501' || errMsg.toLowerCase().includes('permission denied')) {
              tableStatus[name] = false;
              if (isRequired) errorCategory = 'RLS_DENIED';
              console.warn(`[SUPABASE_HEALTH] Table ${name} RLS permission denied: ${errMsg}`);
            } else {
              tableStatus[name] = true;
              isConnected = true;
            }
          } else {
            tableStatus[name] = true;
            isConnected = true;
          }
        };

        await checkTableResult(seqSettled, 'sequence_records', true);
        await checkTableResult(anaSettled, 'analyses', true);
        await checkTableResult(projSettled, 'projects', true);
        await checkTableResult(verSettled, 'sequence_versions', true);
        await checkTableResult(psSettled, 'project_sequences', false); // junction table association check

        const durationMs = Date.now() - startTime;

        let finalState: SupabaseConnectionState = 'CONNECTED';

        if (!isConnected && errorCategory === 'NETWORK_FAILURE') {
          finalState = 'OFFLINE';
          globalError = 'Unable to connect to Supabase backend (offline or unreachable).';
          console.warn('[SUPABASE_HEALTH] Database unreachable (duration: ' + durationMs + 'ms).');
          dbLogger.log({
            operation: 'HEALTH_CHECK',
            status: 'FAILED',
            storage: 'local_recovery',
            durationMs,
            message: globalError,
            error: globalError
          });
        } else if (missingTables.length > 0) {
          finalState = 'DATABASE_ERROR';
          errorCategory = 'SCHEMA_MISSING';
          globalError = `Supabase core tables missing: ${missingTables.join(', ')}.`;
          console.warn('[SUPABASE_HEALTH] Missing core tables detected:', missingTables);
          dbLogger.log({
            operation: 'HEALTH_CHECK',
            status: 'FAILED',
            storage: 'supabase',
            durationMs,
            message: globalError,
            details: { missingTables }
          });
        } else if (errorCategory === 'RLS_DENIED') {
          finalState = 'DATABASE_ERROR';
          globalError = 'Supabase RLS permission denied.';
          dbLogger.log({
            operation: 'HEALTH_CHECK',
            status: 'FAILED',
            storage: 'supabase',
            durationMs,
            message: globalError,
            error: globalError
          });
        } else {
          finalState = 'CONNECTED';
          console.log(`[SUPABASE_HEALTH] Supabase connection verified in ${durationMs}ms (sequence_records, analyses, projects, sequence_versions reachable).`);
          dbLogger.log({
            operation: 'HEALTH_CHECK',
            status: 'SUCCESS',
            storage: 'supabase',
            durationMs,
            message: 'Supabase connection verified.'
          });

          // Trigger background sync of any pending offline records
          this.syncPendingRecoveryQueue().catch(() => {});
        }

        const healthRes: SchemaHealthStatus = {
          state: finalState,
          isConfigured: true,
          connected: finalState === 'CONNECTED',
          tables: tableStatus,
          missingTables,
          errorCategory,
          errorMessage: globalError,
          checkedAt: new Date().toISOString()
        };

        cachedHealthStatus = {
          status: healthRes,
          timestamp: Date.now()
        };

        return healthRes;
      } catch (err: any) {
        console.warn('[SUPABASE_HEALTH] Schema health check exception:', err?.message || err);
        dbLogger.log({
          operation: 'HEALTH_CHECK',
          status: 'FAILED',
          storage: 'local_recovery',
          message: 'Health check exception: ' + (err?.message || 'Network unreachable'),
          error: err?.message
        });

        const fallbackRes: SchemaHealthStatus = {
          state: 'OFFLINE',
          isConfigured: true,
          connected: false,
          tables: tableStatus,
          missingTables: ['sequence_records', 'analyses', 'projects', 'sequence_versions'],
          errorCategory: 'NETWORK_FAILURE',
          errorMessage: 'Unable to connect to Supabase backend. Operating in offline mode.',
          checkedAt: new Date().toISOString()
        };

        cachedHealthStatus = {
          status: fallbackRes,
          timestamp: Date.now()
        };

        return fallbackRes;
      } finally {
        inFlightHealthCheck = null;
      }
    })();

    return inFlightHealthCheck;
  },

  /**
   * Explicitly test sequence_versions table with actual query/insert/select
   */
  async verifySequenceVersionsTable(): Promise<{
    reachable: boolean;
    canSelect: boolean;
    canInsert: boolean;
    error: string | null;
    durationMs: number;
  }> {
    const startTime = Date.now();
    console.log('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Testing public.sequence_versions table access...');

    if (!isSupabaseConfigured) {
      return {
        reachable: false,
        canSelect: false,
        canInsert: false,
        error: 'Supabase is not configured',
        durationMs: Date.now() - startTime
      };
    }

    try {
      // 1. Test Select
      const selectRes = await supabase
        .from('sequence_versions')
        .select('id, version_number, sequence_data, created_at')
        .limit(1);

      if (selectRes.error) {
        console.warn('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Select failed on sequence_versions:', selectRes.error.message);
        return {
          reachable: false,
          canSelect: false,
          canInsert: false,
          error: selectRes.error.message,
          durationMs: Date.now() - startTime
        };
      }

      console.log('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Select succeeded on sequence_versions.');

      // 2. Test Insert a test verification record
      const testId = generateUUID();
      const insertRes = await supabase
        .from('sequence_versions')
        .insert({
          id: testId,
          version_number: 999,
          sequence_data: 'ATGC',
          original_length: 4,
          modified_length: 4,
          total_changes: 0,
          status: 'Draft',
          metadata: { isVerificationTest: true, timestamp: new Date().toISOString() }
        })
        .select('id')
        .single();

      let canInsert = false;
      let insertError: string | null = null;

      if (insertRes.error) {
        console.warn('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Test insert note on sequence_versions:', insertRes.error.message);
        insertError = insertRes.error.message;
      } else {
        canInsert = true;
        console.log('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Test insert succeeded with id:', testId);
        
        // Clean up test verification record
        try {
          await supabase.from('sequence_versions').delete().eq('id', testId);
          console.log('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Cleaned up verification record.');
        } catch {}
      }

      return {
        reachable: true,
        canSelect: true,
        canInsert,
        error: insertError,
        durationMs: Date.now() - startTime
      };
    } catch (err: any) {
      console.warn('[SUPABASE_HEALTH] [SEQUENCE_VERSION] Exception during table verification:', err);
      return {
        reachable: false,
        canSelect: false,
        canInsert: false,
        error: err?.message || 'Verification exception',
        durationMs: Date.now() - startTime
      };
    }
  },

  /**
   * CENTRALIZED PERSISTENCE FUNCTION
   * saveCompletedAnalysis
   * 
   * 1. Validates required data
   * 2. Saves sequence to sequence_records table
   * 3. Saves analysis to analyses table with sequence_id relation
   * 4. Verifies insert success and returns created IDs
   * 5. Falls back to local recovery queue if and only if Supabase actually fails
   */
  async saveCompletedAnalysis(
    userId: string | undefined,
    input: SaveCompletedAnalysisInput
  ): Promise<PersistenceResult<AnalysisRecord>> {
    const startTime = Date.now();
    const sequenceId = generateUUID();
    const analysisId = generateUUID();
    const validUserId = isValidUUID(userId) ? userId : null;

    // Validate inputs
    const accession = input.sequenceInfo.accession?.trim() || `seq-${Date.now().toString(36)}`;
    const pipeline = input.analysisInfo.analysis_type?.trim() || 'Sequence Analysis';
    const totalLength = input.sequenceInfo.total_length || (input.sequenceInfo.sequence ? input.sequenceInfo.sequence.length : 0);
    const analyzedLength = input.analysisInfo.analyzed_length || totalLength;

    const validProjectId = isValidUUID((input as any).projectId || input.analysisInfo?.project_id || (input.sequenceInfo as any)?.project_id)
      ? ((input as any).projectId || input.analysisInfo?.project_id || (input.sequenceInfo as any)?.project_id)
      : null;

    dbLogger.log({
      operation: 'SAVE_ANALYSIS',
      status: 'START',
      sequenceId,
      analysisId,
      accession,
      pipeline,
      source: input.sequenceInfo.source || 'Direct Input',
      message: `Initiating persistence for ${accession} (${pipeline})...`
    });

    const seqPayload: any = {
      id: sequenceId,
      source: input.sequenceInfo.source || 'Direct Input',
      accession,
      version: input.sequenceInfo.version || null,
      organism: input.sequenceInfo.organism || 'Homo sapiens',
      molecule_type: input.sequenceInfo.molecule_type || null,
      sequence_type: input.sequenceInfo.sequence_type || (input.analysisInfo.sequence_type === 'PROTEIN' ? 'Protein' : 'Genomic DNA'),
      definition: input.sequenceInfo.definition || accession,
      total_length: totalLength,
      topology: input.sequenceInfo.topology || 'linear',
      sequence: input.sequenceInfo.sequence || null,
      metadata: input.sequenceInfo.metadata || {}
    };
    if (validUserId) seqPayload.user_id = validUserId;

    const anaPayload: any = {
      id: analysisId,
      sequence_id: sequenceId,
      analysis_type: pipeline,
      analysis_scope: input.analysisInfo.analysis_scope || 'Complete Sequence',
      total_sequence_length: totalLength,
      analyzed_length: analyzedLength,
      sequence_type: input.analysisInfo.sequence_type,
      input_source: input.analysisInfo.input_source || (input.sequenceInfo.source ? `${input.sequenceInfo.source}: ${accession}` : accession),
      result_summary: input.analysisInfo.result_summary || `${input.analysisInfo.sequence_type} Analysis: ${analyzedLength.toLocaleString()} units`,
      results: input.analysisInfo.results || {},
      status: input.analysisInfo.status || 'Completed'
    };
    if (validUserId) anaPayload.user_id = validUserId;
    if (validProjectId) anaPayload.project_id = validProjectId;

    // DIRECT SUPABASE PERSISTENCE ATTEMPT
    if (isSupabaseConfigured) {
      try {
        console.log('[BioService] Executing direct Supabase persistence...');

        // 1. Insert sequence record into Supabase
        const { data: seqData, error: seqError } = await supabase
          .from('sequence_records')
          .insert(seqPayload)
          .select()
          .single();

        if (seqError) {
          throw new Error(`Supabase sequence_records insert failed: ${seqError.message} (code: ${seqError.code})`);
        }

        dbLogger.log({
          operation: 'SAVE_SEQUENCE',
          status: 'SUCCESS',
          sequenceId: seqData.id,
          accession,
          storage: 'supabase',
          message: `Sequence record ${accession} inserted into Supabase (ID: ${seqData.id}).`
        });

        // 2. Insert analysis record into Supabase
        anaPayload.sequence_id = seqData.id;
        const { data: anaData, error: anaError } = await supabase
          .from('analyses')
          .insert(anaPayload)
          .select()
          .single();

        if (anaError) {
          throw new Error(`Supabase analyses insert failed: ${anaError.message} (code: ${anaError.code})`);
        }

        const durationMs = Date.now() - startTime;

        const completeRecord: AnalysisRecord = {
          id: anaData.id,
          user_id: anaData.user_id,
          sequence_id: anaData.sequence_id,
          project_id: anaData.project_id,
          analysis_type: anaData.analysis_type,
          analysis_scope: anaData.analysis_scope || 'Complete Sequence',
          total_sequence_length: anaData.total_sequence_length || totalLength,
          analyzed_length: anaData.analyzed_length || analyzedLength,
          sequence_type: anaData.sequence_type,
          input_source: anaData.input_source,
          status: anaData.status,
          result_summary: anaData.result_summary,
          results: anaData.results,
          created_at: anaData.created_at,
          updated_at: anaData.updated_at,
          sequence_record: {
            id: seqData.id,
            user_id: seqData.user_id,
            source: seqData.source,
            accession: seqData.accession,
            version: seqData.version,
            organism: seqData.organism,
            molecule_type: seqData.molecule_type,
            sequence_type: seqData.sequence_type,
            definition: seqData.definition,
            total_length: seqData.total_length,
            topology: seqData.topology,
            sequence: seqData.sequence,
            metadata: seqData.metadata,
            created_at: seqData.created_at,
            updated_at: seqData.updated_at
          },
          _is_local_fallback: false
        };

        dbLogger.log({
          operation: 'SAVE_ANALYSIS',
          status: 'SUCCESS',
          sequenceId: seqData.id,
          analysisId: anaData.id,
          accession,
          pipeline,
          storage: 'supabase',
          durationMs,
          message: 'Analysis securely saved to Supabase Cloud.'
        });

        // Also update local cache for smooth offline instant retrieval
        try {
          const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
          const updated = [completeRecord, ...localAna.filter((a: any) => a.id !== completeRecord.id)];
          setLocalItem('biocode_analyses', JSON.stringify(updated.slice(0, 100)));
        } catch {}

        return {
          data: completeRecord,
          storage: 'supabase',
          message: 'Analysis securely saved to Supabase Cloud.',
          sequenceId: seqData.id,
          analysisId: anaData.id,
          sync_status: 'synced'
        };

      } catch (err: any) {
        console.error('Supabase persistence failed:', err);
        return this.handleOfflineRecoverySave(seqPayload, anaPayload, err?.message || 'Database error');
      }
    } else {
      console.warn('[BioService] Supabase not configured, saving to local recovery queue.');
      return this.handleOfflineRecoverySave(seqPayload, anaPayload, 'Supabase credentials not configured');
    }
  },

  /**
   * Backward-compatible alias for saveCompletedAnalysis
   */
  async createFullAnalysis(
    userId: string | undefined,
    payload: {
      sequenceInfo: {
        source?: string;
        accession: string;
        version?: string;
        organism?: string;
        molecule_type?: string;
        sequence_type?: string;
        definition?: string;
        total_length: number;
        topology?: string;
        sequence?: string;
        metadata?: Record<string, any>;
      };
      analysisInfo: {
        analysis_type: string;
        analysis_scope?: string;
        total_sequence_length?: number;
        analyzed_length?: number;
        sequence_type: string;
        input_source?: string;
        result_summary?: string;
        results?: any;
        status?: 'Completed' | 'Pending' | 'Failed';
      };
    }
  ): Promise<PersistenceResult<AnalysisRecord>> {
    return this.saveCompletedAnalysis(userId, payload as any);
  },

  /**
   * Internal helper to store failed cloud analyses in the pending offline recovery queue
   */
  handleOfflineRecoverySave(
    seqPayload: any,
    anaPayload: any,
    errorMessage: string
  ): PersistenceResult<AnalysisRecord> {
    const recoveryId = anaPayload.id || generateUUID();
    const now = new Date().toISOString();

    const pendingItem: PendingRecoveryRecord = {
      id: recoveryId,
      timestamp: now,
      userId: anaPayload.user_id || null,
      sequencePayload: seqPayload,
      analysisPayload: anaPayload,
      sync_status: 'pending',
      attempts: 1,
      lastError: errorMessage
    };

    // 1. Add to pending recovery queue
    try {
      const queue: PendingRecoveryRecord[] = JSON.parse(getLocalItem('pending_analysis_queue', '[]'));
      queue.unshift(pendingItem);
      setLocalItem('pending_analysis_queue', JSON.stringify(queue.slice(0, 50)));
    } catch {}

    // 2. Add to local offline history cache
    const fallbackSeqRecord: SequenceRecord = {
      ...seqPayload,
      created_at: now,
      updated_at: now
    };

    const fallbackRecord: AnalysisRecord = {
      ...anaPayload,
      id: recoveryId,
      created_at: now,
      updated_at: now,
      sequence_record: fallbackSeqRecord,
      _is_local_fallback: true
    };

    try {
      const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
      localAna.unshift(fallbackRecord);
      setLocalItem('biocode_analyses', JSON.stringify(localAna.slice(0, 100)));

      const localSeq = JSON.parse(getLocalItem('biocode_sequence_records', '[]'));
      localSeq.unshift(fallbackSeqRecord);
      setLocalItem('biocode_sequence_records', JSON.stringify(localSeq.slice(0, 100)));
    } catch {}

    dbLogger.log({
      operation: 'SAVE_ANALYSIS',
      status: 'RECOVERY_QUEUED',
      sequenceId: seqPayload.id,
      analysisId: recoveryId,
      accession: seqPayload.accession,
      pipeline: anaPayload.analysis_type,
      storage: 'local_recovery',
      message: 'Cloud save failed. Saved temporarily to local recovery storage.',
      error: errorMessage
    });

    return {
      data: fallbackRecord,
      storage: 'local_recovery',
      message: 'Cloud save failed. Saved temporarily to local recovery storage.',
      warning: errorMessage,
      error: errorMessage,
      sequenceId: seqPayload.id,
      analysisId: recoveryId,
      sync_status: 'pending'
    };
  },

  /**
   * Automatic background synchronization of pending recovery queue items when Supabase returns online
   */
  async syncPendingRecoveryQueue(userId?: string): Promise<{ syncedCount: number; failedCount: number }> {
    if (!isSupabaseConfigured || typeof window === 'undefined' || typeof localStorage === 'undefined') return { syncedCount: 0, failedCount: 0 };

    try {
      const queueRaw = localStorage.getItem('pending_analysis_queue');
      if (!queueRaw) return { syncedCount: 0, failedCount: 0 };

      const queue: PendingRecoveryRecord[] = JSON.parse(queueRaw);
      if (!queue.length) return { syncedCount: 0, failedCount: 0 };

      dbLogger.log({
        operation: 'SYNC_OFFLINE_QUEUE',
        status: 'START',
        message: `Attempting recovery sync for ${queue.length} pending record(s)...`
      });

      const remainingQueue: PendingRecoveryRecord[] = [];
      let syncedCount = 0;
      let failedCount = 0;

      for (const item of queue) {
        try {
          const seqPayload = { ...item.sequencePayload };
          delete seqPayload.project_id;
          delete seqPayload._is_local_fallback;

          if (!isValidUUID(seqPayload.id)) {
            seqPayload.id = generateUUID();
          }

          const anaPayload = { ...item.analysisPayload };
          delete anaPayload._is_local_fallback;
          anaPayload.sequence_id = seqPayload.id;

          if (!isValidUUID(anaPayload.id)) {
            anaPayload.id = generateUUID();
          }

          // 1. Upsert sequence record
          const { error: seqErr } = await supabase.from('sequence_records').upsert(seqPayload);
          if (seqErr && !seqErr.message.includes('duplicate')) {
            throw new Error(`sequence_records upsert failed: ${seqErr.message}`);
          }

          // 2. Upsert analysis record
          const { error: anaErr } = await supabase.from('analyses').upsert(anaPayload);
          if (anaErr && !anaErr.message.includes('duplicate')) {
            throw new Error(`analyses upsert failed: ${anaErr.message}`);
          }

          syncedCount++;
          dbLogger.log({
            operation: 'SYNC_OFFLINE_QUEUE',
            status: 'RECOVERY_SYNCED',
            sequenceId: seqPayload.id,
            analysisId: anaPayload.id,
            accession: seqPayload.accession,
            pipeline: anaPayload.analysis_type,
            storage: 'supabase',
            message: `Successfully synchronized pending analysis ${anaPayload.id} to Supabase.`
          });
        } catch (itemErr: any) {
          failedCount++;
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = itemErr?.message || 'Sync failed';
          remainingQueue.push(item);
        }
      }

      localStorage.setItem('pending_analysis_queue', JSON.stringify(remainingQueue));
      return { syncedCount, failedCount };
    } catch (err) {
      console.warn('[BioService] Error in syncPendingRecoveryQueue:', err);
      return { syncedCount: 0, failedCount: 0 };
    }
  },

  /**
   * Sequence Records Service
   * Safely retrieves sequence records from Supabase with offline caching and deduplication
   */
  async getSequenceRecords(userId?: string, forceRefresh: boolean = false): Promise<SequenceRecord[]> {
    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured) {
          try {
            const local = localStorage.getItem('biocode_sequence_records');
            return local ? JSON.parse(local) : [];
          } catch {
            return [];
          }
        }

        try {
          let query = supabase.from('sequence_records').select('*').order('created_at', { ascending: false });
          
          if (isValidUUID(userId)) {
            query = query.or(`user_id.eq.${userId},user_id.is.null`);
          }

          const { data, error } = await query;

          if (error) {
            console.error('[BioService] Supabase sequence_records query error:', error);
            if (requestManager.isRateLimitError(error)) {
              throw error;
            }
            throw new Error(`Supabase query error: ${error.message || JSON.stringify(error)}`);
          }

          const cloudRecords: SequenceRecord[] = (data || []).map((r: any) => ({
            id: r.id,
            user_id: r.user_id,
            project_id: r.project_id,
            source: r.source || 'Direct Input',
            accession: r.accession,
            version: r.version,
            organism: r.organism || 'Homo sapiens',
            molecule_type: r.molecule_type,
            sequence_type: r.sequence_type || 'Genomic DNA',
            definition: r.definition,
            total_length: r.total_length || 0,
            topology: r.topology || 'linear',
            sequence: r.sequence,
            metadata: r.metadata || {},
            created_at: r.created_at,
            updated_at: r.updated_at
          }));

          // Cache locally for offline resiliency
          try {
            localStorage.setItem('biocode_sequence_records', JSON.stringify(cloudRecords.slice(0, 100)));
          } catch {}

          return cloudRecords;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.error('[BioService] Exception in getSequenceRecords:', err?.message || err);
          throw err;
        }
      },
      {
        key: `seq_records_${userId || 'all'}`,
        ttlMs: 5000,
        forceRefresh
      }
    );
  },

  async createSequenceRecord(
    userId: string | undefined, 
    record: {
      source?: string;
      accession: string;
      version?: string;
      organism?: string;
      molecule_type?: string;
      sequence_type?: string;
      definition?: string;
      total_length: number;
      topology?: string;
      sequence?: string;
      project_id?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<PersistenceResult<SequenceRecord>> {
    const generatedId = generateUUID();
    const validUserId = isValidUUID(userId) ? userId : null;

    const newRecord: SequenceRecord = {
      id: generatedId,
      user_id: validUserId,
      source: record.source || 'Direct Input',
      accession: record.accession,
      version: record.version || null,
      organism: record.organism || 'Homo sapiens',
      molecule_type: record.molecule_type || null,
      sequence_type: record.sequence_type || 'Genomic DNA',
      definition: record.definition || record.accession,
      total_length: record.total_length,
      topology: record.topology || 'linear',
      sequence: record.sequence || null,
      metadata: record.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!isSupabaseConfigured) {
      try {
        const local = localStorage.getItem('biocode_sequence_records');
        const list = local ? JSON.parse(local) : [];
        list.unshift(newRecord);
        localStorage.setItem('biocode_sequence_records', JSON.stringify(list.slice(0, 100)));
      } catch {}
      return {
        data: newRecord,
        storage: 'local_fallback',
        warning: 'Supabase is not configured. Saved to local storage fallback.'
      };
    }

    try {
      const insertPayload: any = {
        id: generatedId,
        source: record.source || 'Direct Input',
        accession: record.accession,
        version: record.version || null,
        organism: record.organism || 'Homo sapiens',
        molecule_type: record.molecule_type || null,
        sequence_type: record.sequence_type || 'Genomic DNA',
        definition: record.definition || record.accession,
        total_length: record.total_length,
        topology: record.topology || 'linear',
        sequence: record.sequence || null,
        metadata: record.metadata || {}
      };

      if (validUserId) {
        insertPayload.user_id = validUserId;
      }

      const { data, error } = await supabase
        .from('sequence_records')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[BioService] Supabase error inserting sequence_records:', error);
        return {
          data: newRecord,
          storage: 'local_fallback',
          warning: `Supabase table "sequence_records" insert failed: ${error.message}.`,
          error: error.message
        };
      }

      requestManager.invalidateCache();
      return {
        data: {
          id: data.id,
          user_id: data.user_id,
          source: data.source,
          accession: data.accession,
          version: data.version,
          organism: data.organism,
          molecule_type: data.molecule_type,
          sequence_type: data.sequence_type,
          definition: data.definition,
          total_length: data.total_length,
          topology: data.topology,
          sequence: data.sequence,
          metadata: data.metadata,
          created_at: data.created_at,
          updated_at: data.updated_at
        },
        storage: 'supabase'
      };
    } catch (err: any) {
      console.error('[BioService] Exception in createSequenceRecord:', err);
      return {
        data: newRecord,
        storage: 'local_fallback',
        warning: err.message || 'Unknown network error. Saved to local fallback.',
        error: err.message
      };
    }
  },

  async deleteSequenceRecord(sequenceId: string): Promise<boolean> {
    if (!sequenceId) throw new Error('Sequence ID is required.');

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('sequence_records')
        .delete()
        .eq('id', sequenceId);

      if (error) throw new Error(error.message || 'Failed to delete sequence record.');
    }

    try {
      const local = getLocalItem('biocode_sequence_records', '[]');
      const list = JSON.parse(local).filter((s: any) => s.id !== sequenceId);
      setLocalItem('biocode_sequence_records', JSON.stringify(list));
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  /**
   * Analyses Service
   * Unified persistence & audit log query that fetches real Supabase records from both
   * `analyses` and `sequence_records` tables, guarantees relationship linkage,
   * handles NULL user_ids, and provides seamless offline fallback to localStorage.
   */
  async getAnalyses(userId?: string, forceRefresh: boolean = false): Promise<AnalysisRecord[]> {
    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured) {
          try {
            const local = localStorage.getItem('biocode_analyses');
            return local ? JSON.parse(local) : [];
          } catch {
            return [];
          }
        }

        try {
          // 1. Fetch sequence records
          const sequenceRecords = await this.getSequenceRecords(userId, forceRefresh);
          const seqMap = new Map<string, SequenceRecord>();
          sequenceRecords.forEach(s => seqMap.set(s.id, s));

          // 2. Fetch analyses from Supabase
          let anaQuery = supabase
            .from('analyses')
            .select('*')
            .order('created_at', { ascending: false });

          if (isValidUUID(userId)) {
            anaQuery = anaQuery.or(`user_id.eq.${userId},user_id.is.null`);
          }

          const { data: analysesData, error: anaError } = await anaQuery;

          if (anaError) {
            console.warn('[BioService] Supabase analyses query returned error:', anaError.message || anaError);
            if (requestManager.isRateLimitError(anaError)) {
              throw anaError;
            }
          }

          const rawAnalyses = analysesData || [];

          // 3. Map analyses records and link sequence_records
          const linkedSequenceIds = new Set<string>();
          const mappedAnalyses: AnalysisRecord[] = rawAnalyses.map((a: any) => {
            let seqRecord: SequenceRecord | null = null;
            if (a.sequence_id && seqMap.has(a.sequence_id)) {
              seqRecord = seqMap.get(a.sequence_id)!;
              linkedSequenceIds.add(a.sequence_id);
            } else if (a.sequence_record) {
              seqRecord = a.sequence_record;
            }

            return {
              id: a.id,
              user_id: a.user_id,
              sequence_id: a.sequence_id,
              project_id: a.project_id,
              analysis_type: a.analysis_type,
              analysis_scope: a.analysis_scope || 'Complete Sequence',
              total_sequence_length: a.total_sequence_length || a.sequence_length || (seqRecord ? seqRecord.total_length : 0),
              analyzed_length: a.analyzed_length || a.sequence_length || (seqRecord ? seqRecord.total_length : 0),
              sequence_type: a.sequence_type || (seqRecord ? seqRecord.sequence_type : 'DNA'),
              input_source: a.input_source || (seqRecord ? `${seqRecord.source}: ${seqRecord.accession}` : 'Direct Input'),
              status: a.status || 'Completed',
              result_summary: a.result_summary || (seqRecord ? seqRecord.definition : undefined),
              results: a.results,
              created_at: a.created_at,
              updated_at: a.updated_at,
              sequence_record: seqRecord,
              _is_local_fallback: false
            };
          });

          // 4. Standalone sequence records that don't have explicit analyses linked
          const standaloneRecords: AnalysisRecord[] = sequenceRecords
            .filter(seq => !linkedSequenceIds.has(seq.id))
            .map(seq => {
              const typeUpper = (seq.sequence_type || 'DNA').toUpperCase();
              const normType: 'DNA' | 'RNA' | 'PROTEIN' = 
                typeUpper.includes('PROT') ? 'PROTEIN' : 
                typeUpper.includes('RNA') ? 'RNA' : 'DNA';

              const inferredPipeline = seq.metadata?.pipeline || 
                (normType === 'PROTEIN' ? 'Complete Protein Structure & Properties' : 
                 normType === 'RNA' ? 'RNA Secondary Structure & Thermodynamic Folding' : 
                 'Complete GC & 6-Frame ORF Analysis');

              return {
                id: seq.id,
                user_id: seq.user_id,
                sequence_id: seq.id,
                project_id: null,
                analysis_type: inferredPipeline,
                analysis_scope: seq.metadata?.scope || 'Complete Sequence',
                total_sequence_length: seq.total_length || (seq.sequence ? seq.sequence.length : 0),
                analyzed_length: seq.total_length || (seq.sequence ? seq.sequence.length : 0),
                sequence_type: normType,
                input_source: seq.source ? `${seq.source}: ${seq.accession}` : seq.accession,
                status: 'Completed',
                result_summary: seq.definition || `${seq.organism} - ${seq.accession}`,
                results: seq.metadata || {},
                created_at: seq.created_at,
                updated_at: seq.updated_at,
                sequence_record: seq,
                _is_local_fallback: false
              };
            });

          // 5. Combine cloud records
          const combinedMap = new Map<string, AnalysisRecord>();
          mappedAnalyses.forEach(item => combinedMap.set(item.id, item));
          standaloneRecords.forEach(item => {
            if (!combinedMap.has(item.id)) {
              combinedMap.set(item.id, item);
            }
          });

          // Merge any un-synced offline pending recovery items
          try {
            const local = localStorage.getItem('biocode_analyses');
            if (local) {
              const localList: AnalysisRecord[] = JSON.parse(local);
              localList.forEach(l => {
                if (!combinedMap.has(l.id)) {
                  combinedMap.set(l.id, l);
                }
              });
            }
          } catch {}

          const finalRecords = Array.from(combinedMap.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          return finalRecords;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.warn('[BioService] Exception in getAnalyses, using local storage fallback:', err?.message || err);
          try {
            const local = localStorage.getItem('biocode_analyses');
            return local ? JSON.parse(local) : [];
          } catch {
            return [];
          }
        }
      },
      {
        key: `getAnalyses_${userId || 'anon'}`,
        ttlMs: 30000,
        forceRefresh
      }
    );
  },

  /**
   * Fetch a single analysis record by ID from Supabase with full relationship to sequence_records.
   */
  async getAnalysisById(id: string, userId?: string, forceRefresh: boolean = false): Promise<AnalysisRecord | null> {
    if (!id) return null;
    return requestManager.execute(
      async () => {
        console.log('[BioService] getAnalysisById called for ID:', id);

        dbLogger.log({
          operation: 'REOPEN_ANALYSIS',
          status: 'START',
          analysisId: id,
          message: `Fetching analysis details for canonical ID ${id}...`
        });

        // If Supabase is not configured, search local caches
        if (!isSupabaseConfigured) {
          try {
            const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
            const foundAna = localAna.find((a: any) => a.id === id);
            if (foundAna) return foundAna;

            const localSeq = JSON.parse(getLocalItem('biocode_sequence_records', '[]'));
            const foundSeq = localSeq.find((s: any) => s.id === id);
            if (foundSeq) {
              return {
                id: foundSeq.id,
                user_id: foundSeq.user_id,
                sequence_id: foundSeq.id,
                project_id: null,
                analysis_type: foundSeq.metadata?.pipeline || 'Sequence Analysis',
                analysis_scope: foundSeq.metadata?.scope || 'Complete Sequence',
                total_sequence_length: foundSeq.total_length || (foundSeq.sequence ? foundSeq.sequence.length : 0),
                analyzed_length: foundSeq.total_length || (foundSeq.sequence ? foundSeq.sequence.length : 0),
                sequence_type: foundSeq.sequence_type || 'DNA',
                input_source: foundSeq.source ? `${foundSeq.source}: ${foundSeq.accession}` : foundSeq.accession,
                status: 'Completed',
                result_summary: foundSeq.definition || `${foundSeq.organism} - ${foundSeq.accession}`,
                results: foundSeq.metadata || {},
                created_at: foundSeq.created_at,
                updated_at: foundSeq.updated_at || foundSeq.created_at,
                sequence_record: foundSeq,
                _is_local_fallback: true
              };
            }
            return null;
          } catch (err) {
            console.error('[BioService] Local fallback lookup error:', err);
            return null;
          }
        }

        try {
          // 1. Search the `analyses` table in Supabase
          const { data: anaData, error: anaError } = await supabase
            .from('analyses')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (anaError && requestManager.isRateLimitError(anaError)) {
            throw anaError;
          }

          if (anaData) {
            let seqRecord: SequenceRecord | null = null;
            if (anaData.sequence_id) {
              const { data: seqData } = await supabase
                .from('sequence_records')
                .select('*')
                .eq('id', anaData.sequence_id)
                .maybeSingle();

              if (seqData) {
                seqRecord = {
                  id: seqData.id,
                  user_id: seqData.user_id,
                  source: seqData.source || 'Direct Input',
                  accession: seqData.accession,
                  version: seqData.version,
                  organism: seqData.organism || 'Homo sapiens',
                  molecule_type: seqData.molecule_type,
                  sequence_type: seqData.sequence_type || 'Genomic DNA',
                  definition: seqData.definition,
                  total_length: seqData.total_length || 0,
                  topology: seqData.topology || 'linear',
                  sequence: seqData.sequence,
                  metadata: seqData.metadata || {},
                  created_at: seqData.created_at,
                  updated_at: seqData.updated_at
                };
              }
            }

            const resolved: AnalysisRecord = {
              id: anaData.id,
              user_id: anaData.user_id,
              sequence_id: anaData.sequence_id,
              project_id: anaData.project_id,
              analysis_type: anaData.analysis_type,
              analysis_scope: anaData.analysis_scope || 'Complete Sequence',
              total_sequence_length: anaData.total_sequence_length || anaData.sequence_length || (seqRecord ? seqRecord.total_length : 0),
              analyzed_length: anaData.analyzed_length || anaData.sequence_length || (seqRecord ? seqRecord.total_length : 0),
              sequence_type: anaData.sequence_type || (seqRecord ? seqRecord.sequence_type : 'DNA'),
              input_source: anaData.input_source || (seqRecord ? `${seqRecord.source}: ${seqRecord.accession}` : 'Direct Input'),
              status: anaData.status || 'Completed',
              result_summary: anaData.result_summary || (seqRecord ? seqRecord.definition : undefined),
              results: anaData.results,
              created_at: anaData.created_at,
              updated_at: anaData.updated_at,
              sequence_record: seqRecord,
              _is_local_fallback: false
            };

            dbLogger.log({
              operation: 'REOPEN_ANALYSIS',
              status: 'SUCCESS',
              analysisId: id,
              sequenceId: resolved.sequence_id,
              accession: seqRecord?.accession,
              pipeline: resolved.analysis_type,
              storage: 'supabase',
              message: `Loaded analysis record ${id} from Supabase Cloud.`
            });

            return resolved;
          }

          // 2. If not found in `analyses`, check if ID corresponds directly to a `sequence_records` row
          const { data: seqData, error: seqError } = await supabase
            .from('sequence_records')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (seqError && requestManager.isRateLimitError(seqError)) {
            throw seqError;
          }

          if (seqData) {
            const seqRecord: SequenceRecord = {
              id: seqData.id,
              user_id: seqData.user_id,
              source: seqData.source || 'Direct Input',
              accession: seqData.accession,
              version: seqData.version,
              organism: seqData.organism || 'Homo sapiens',
              molecule_type: seqData.molecule_type,
              sequence_type: seqData.sequence_type || 'Genomic DNA',
              definition: seqData.definition,
              total_length: seqData.total_length || 0,
              topology: seqData.topology || 'linear',
              sequence: seqData.sequence,
              metadata: seqData.metadata || {},
              created_at: seqData.created_at,
              updated_at: seqData.updated_at
            };

            const typeUpper = (seqRecord.sequence_type || 'DNA').toUpperCase();
            const normType: 'DNA' | 'RNA' | 'PROTEIN' = 
              typeUpper.includes('PROT') ? 'PROTEIN' : 
              typeUpper.includes('RNA') ? 'RNA' : 'DNA';

            return {
              id: seqRecord.id,
              user_id: seqRecord.user_id,
              sequence_id: seqRecord.id,
              project_id: null,
              analysis_type: seqRecord.metadata?.pipeline || 'Sequence Analysis',
              analysis_scope: seqRecord.metadata?.scope || 'Complete Sequence',
              total_sequence_length: seqRecord.total_length || (seqRecord.sequence ? seqRecord.sequence.length : 0),
              analyzed_length: seqRecord.total_length || (seqRecord.sequence ? seqRecord.sequence.length : 0),
              sequence_type: normType,
              input_source: seqRecord.source ? `${seqRecord.source}: ${seqRecord.accession}` : seqRecord.accession,
              status: 'Completed',
              result_summary: seqRecord.definition || `${seqRecord.organism} - ${seqRecord.accession}`,
              results: seqRecord.metadata || {},
              created_at: seqRecord.created_at,
              updated_at: seqRecord.updated_at || seqRecord.created_at,
              sequence_record: seqRecord,
              _is_local_fallback: false
            };
          }

          // 3. Fallback to local recovery storage
          const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
          const foundAna = localAna.find((a: any) => a.id === id);
          if (foundAna) return { ...foundAna, _is_local_fallback: true };

          return null;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.error('[BioService] Error in getAnalysisById:', err);
          try {
            const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
            const found = localAna.find((a: any) => a.id === id);
            if (found) return found;
          } catch {}
          throw err;
        }
      },
      {
        key: `getAnalysisById_${id}_${userId || 'anon'}`,
        ttlMs: 60000,
        forceRefresh
      }
    );
  },

  async createAnalysis(
    userId: string | undefined, 
    record: {
      sequence_id?: string;
      project_id?: string;
      analysis_type: string;
      analysis_scope?: string;
      total_sequence_length?: number;
      analyzed_length?: number;
      sequence_type: string;
      sequence_length?: number;
      input_source?: string;
      result_summary?: string;
      results?: any;
      status?: 'Completed' | 'Pending' | 'Failed';
    }
  ): Promise<PersistenceResult<AnalysisRecord>> {
    const generatedId = generateUUID();
    const validUserId = isValidUUID(userId) ? userId : null;
    const validSeqId = isValidUUID(record.sequence_id) ? record.sequence_id : null;
    const validProjId = isValidUUID(record.project_id) ? record.project_id : null;

    const effectiveSeqLength = record.analyzed_length || record.sequence_length || record.total_sequence_length || 0;
    const effectiveTotalLength = record.total_sequence_length || effectiveSeqLength;

    const newRecord: AnalysisRecord = {
      id: generatedId,
      user_id: validUserId,
      sequence_id: validSeqId,
      project_id: validProjId,
      analysis_type: record.analysis_type,
      analysis_scope: record.analysis_scope || 'Complete Sequence',
      total_sequence_length: effectiveTotalLength,
      analyzed_length: effectiveSeqLength,
      sequence_type: record.sequence_type,
      input_source: record.input_source || 'Manual Input',
      status: record.status || 'Completed',
      result_summary: record.result_summary || null,
      results: record.results || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _is_local_fallback: !isSupabaseConfigured
    };

    if (!isSupabaseConfigured) {
      try {
        const local = getLocalItem('biocode_analyses', '[]');
        const list = JSON.parse(local);
        list.unshift(newRecord);
        setLocalItem('biocode_analyses', JSON.stringify(list.slice(0, 100)));
      } catch {}
      return {
        data: newRecord,
        storage: 'local_fallback',
        warning: 'Supabase is not configured. Saved to local storage.'
      };
    }

    try {
      const insertData: any = {
        id: generatedId,
        analysis_type: record.analysis_type,
        analysis_scope: record.analysis_scope || 'Complete Sequence',
        total_sequence_length: effectiveTotalLength,
        analyzed_length: effectiveSeqLength,
        sequence_type: record.sequence_type,
        input_source: record.input_source || 'Manual Input',
        status: record.status || 'Completed',
        result_summary: record.result_summary || null,
        results: record.results || null
      };

      if (validUserId) insertData.user_id = validUserId;
      if (validSeqId) insertData.sequence_id = validSeqId;
      if (validProjId) insertData.project_id = validProjId;

      const { data, error } = await supabase
        .from('analyses')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.warn('[BioService] Supabase error inserting analysis:', error);
        return {
          data: { ...newRecord, _is_local_fallback: true },
          storage: 'local_fallback',
          warning: error.message,
          error: error.message
        };
      }

      requestManager.invalidateCache();
      return {
        data: {
          id: data.id,
          user_id: data.user_id,
          sequence_id: data.sequence_id,
          project_id: data.project_id,
          analysis_type: data.analysis_type,
          analysis_scope: data.analysis_scope || 'Complete Sequence',
          total_sequence_length: data.total_sequence_length || effectiveTotalLength,
          analyzed_length: data.analyzed_length || effectiveSeqLength,
          sequence_type: data.sequence_type,
          input_source: data.input_source,
          status: data.status,
          result_summary: data.result_summary,
          results: data.results,
          created_at: data.created_at,
          updated_at: data.updated_at,
          _is_local_fallback: false
        },
        storage: 'supabase'
      };
    } catch (err: any) {
      console.warn('[BioService] Exception saving analysis:', err);
      return {
        data: { ...newRecord, _is_local_fallback: true },
        storage: 'local_fallback',
        warning: err.message || 'Network exception. Saved to local storage.',
        error: err.message
      };
    }
  },

  async deleteAnalysis(analysisId: string): Promise<boolean> {
    if (!analysisId) throw new Error('Analysis ID is required.');

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('analyses')
        .delete()
        .eq('id', analysisId);

      if (error) throw new Error(error.message || 'Failed to delete analysis record.');
    }

    try {
      const local = getLocalItem('biocode_analyses', '[]');
      const list = JSON.parse(local).filter((a: any) => a.id !== analysisId);
      setLocalItem('biocode_analyses', JSON.stringify(list));
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  /**
   * Projects Service
   */
  async getProjects(userId?: string, forceRefresh: boolean = false): Promise<Project[]> {
    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured) {
          try {
            const local = getLocalItem('biocode_projects', '[]');
            return JSON.parse(local);
          } catch {
            return [];
          }
        }

        try {
          let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
          if (isValidUUID(userId)) {
            query = query.or(`user_id.eq.${userId},user_id.is.null`);
          }

          const { data: projData, error } = await query;

          if (error) {
            console.warn('[BioService] Supabase projects query error:', error.message || error);
            if (requestManager.isRateLimitError(error)) throw error;
            try {
              const local = getLocalItem('biocode_projects', '[]');
              return JSON.parse(local);
            } catch {
              return [];
            }
          }

          const projectsList = projData || [];
          if (projectsList.length === 0) return [];

          const projectIds = projectsList.map((p: any) => p.id);

          // Concurrent fetch for metrics calculation across projects
          const [analysesRes, projSeqRes] = await Promise.all([
            supabase.from('analyses').select('id, project_id, sequence_id, created_at, results').in('project_id', projectIds),
            supabase.from('project_sequences').select('project_id, sequence_id, created_at').in('project_id', projectIds)
          ]);

          const allAnalyses = analysesRes.data || [];
          const allProjSeqs = projSeqRes.data || [];

          const cloudProjects: Project[] = projectsList.map((p: any) => {
            const projAnalyses = allAnalyses.filter((a: any) => a.project_id === p.id);
            const projLinks = allProjSeqs.filter((ps: any) => ps.project_id === p.id);

            const seqSet = new Set<string>();
            projLinks.forEach((ps: any) => ps.sequence_id && seqSet.add(ps.sequence_id));
            projAnalyses.forEach((a: any) => a.sequence_id && seqSet.add(a.sequence_id));

            // Calculate modified versions count (V2 results)
            const modifiedCount = projAnalyses.filter((a: any) => {
              const res = a.results || {};
              return res.versionNumber === 2 || (Array.isArray(res.mutations) && res.mutations.length > 0);
            }).length;

            // Determine last activity timestamp
            const timestamps: number[] = [
              new Date(p.created_at).getTime(),
              new Date(p.updated_at || p.created_at).getTime(),
              ...projAnalyses.map((a: any) => new Date(a.created_at).getTime()),
              ...projLinks.map((ps: any) => new Date(ps.created_at).getTime())
            ].filter((t) => !isNaN(t));

            const latestMs = Math.max(...timestamps, 0);

            return {
              id: p.id,
              user_id: p.user_id,
              name: p.name,
              organism: p.organism || 'Homo sapiens',
              description: p.description || '',
              research_objective: p.research_objective || '',
              tags: p.tags || [],
              project_type: p.project_type || 'Genomic Analysis',
              status: (p.status as 'Active' | 'Archived' | 'Processing') || 'Active',
              sequencesCount: seqSet.size,
              analysesCount: projAnalyses.length,
              modifiedVersionsCount: modifiedCount,
              lastUpdated: p.updated_at || p.created_at,
              lastActivity: latestMs > 0 ? new Date(latestMs).toISOString() : p.created_at,
              created_at: p.created_at,
              updated_at: p.updated_at
            };
          });

          try {
            setLocalItem('biocode_projects', JSON.stringify(cloudProjects.slice(0, 50)));
          } catch {}

          return cloudProjects;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.warn('[BioService] Exception in getProjects, using local fallback:', err?.message || err);
          try {
            const local = getLocalItem('biocode_projects', '[]');
            return JSON.parse(local);
          } catch {
            return [];
          }
        }
      },
      {
        key: `getProjects_${userId || 'anon'}`,
        ttlMs: 30000,
        forceRefresh
      }
    );
  },

  async getProjectById(projectId: string): Promise<Project | null> {
    if (!projectId) return null;
    const projects = await this.getProjects(undefined, true);
    const found = projects.find((p) => p.id === projectId);
    if (found) return found;

    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single();
      if (error || !data) return null;

      return {
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        organism: data.organism || 'Homo sapiens',
        description: data.description || '',
        research_objective: data.research_objective || '',
        tags: data.tags || [],
        project_type: data.project_type || 'Genomic Analysis',
        status: (data.status as 'Active' | 'Archived' | 'Processing') || 'Active',
        sequencesCount: 0,
        analysesCount: 0,
        modifiedVersionsCount: 0,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch {
      return null;
    }
  },

  async createProject(userId: string | undefined, project: {
    name: string;
    organism?: string;
    description?: string;
    research_objective?: string;
    tags?: string[] | string;
    status?: 'Active' | 'Archived' | 'Processing';
    project_type?: string;
  }): Promise<Project> {
    const trimmedName = (project.name || '').trim();
    if (!trimmedName) {
      throw new Error('Project name is required.');
    }
    if (trimmedName.length > 120) {
      throw new Error('Project name must not exceed 120 characters.');
    }

    const generatedId = generateUUID();
    const validUserId = isValidUUID(userId) ? userId : null;

    const parsedTags = Array.isArray(project.tags)
      ? project.tags
      : typeof project.tags === 'string'
      ? project.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const newProj: Project = {
      id: generatedId,
      user_id: validUserId || '',
      name: trimmedName,
      organism: project.organism || 'Homo sapiens',
      description: (project.description || '').trim(),
      research_objective: (project.research_objective || '').trim(),
      tags: parsedTags,
      project_type: project.project_type || 'Genomic Analysis',
      status: project.status || 'Active',
      sequencesCount: 0,
      analysesCount: 0,
      modifiedVersionsCount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!isSupabaseConfigured) {
      try {
        const local = getLocalItem('biocode_projects', '[]');
        const list = JSON.parse(local);
        list.unshift(newProj);
        setLocalItem('biocode_projects', JSON.stringify(list.slice(0, 50)));
      } catch {}
      return newProj;
    }

    // Check duplicate name for current user
    try {
      let dupQuery = supabase.from('projects').select('id, name').ilike('name', trimmedName);
      if (validUserId) {
        dupQuery = dupQuery.eq('user_id', validUserId);
      }
      const { data: existing } = await dupQuery;
      if (existing && existing.length > 0) {
        throw new Error(`A project named "${trimmedName}" already exists. Please choose a unique project name.`);
      }
    } catch (dupErr: any) {
      if (dupErr.message && dupErr.message.includes('already exists')) {
        throw dupErr;
      }
    }

    try {
      const insertData: any = {
        id: generatedId,
        name: trimmedName,
        organism: project.organism || 'Homo sapiens',
        description: (project.description || '').trim(),
        project_type: project.project_type || 'Genomic Analysis',
        status: project.status || 'Active'
      };

      if (validUserId) {
        insertData.user_id = validUserId;
      }

      const { data, error } = await supabase
        .from('projects')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.warn('[BioService] Supabase createProject error:', error.message || error);
        throw new Error(error.message || 'Failed to create project in Supabase.');
      }

      requestManager.invalidateCache();
      return {
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        organism: data.organism,
        description: data.description || '',
        research_objective: data.research_objective || '',
        tags: parsedTags,
        project_type: data.project_type,
        status: data.status || 'Active',
        sequencesCount: 0,
        analysesCount: 0,
        modifiedVersionsCount: 0,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (err: any) {
      console.error('[BioService] Exception in createProject:', err);
      throw err;
    }
  },

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    if (!projectId) throw new Error('Project ID is required.');

    const updatePayload: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) updatePayload.name = updates.name.trim();
    if (updates.description !== undefined) updatePayload.description = updates.description.trim();
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.organism !== undefined) updatePayload.organism = updates.organism;
    if (updates.project_type !== undefined) updatePayload.project_type = updates.project_type;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update(updatePayload)
        .eq('id', projectId)
        .select()
        .single();

      if (error) throw new Error(error.message || 'Failed to update project.');
      requestManager.invalidateCache();
      return {
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        organism: data.organism,
        description: data.description || '',
        research_objective: data.research_objective || '',
        tags: Array.isArray(updates.tags) ? updates.tags : [],
        project_type: data.project_type,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    }

    const current = await this.getProjectById(projectId);
    return { ...(current || ({} as any)), ...updates, updated_at: updatePayload.updated_at };
  },

  async archiveProject(projectId: string): Promise<Project> {
    return this.updateProject(projectId, { status: 'Archived' });
  },

  async deleteProject(projectId: string): Promise<boolean> {
    if (!projectId) throw new Error('Project ID is required.');

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw new Error(error.message || 'Failed to delete project.');
    }

    try {
      const local = getLocalItem('biocode_projects', '[]');
      const list = JSON.parse(local).filter((p: any) => p.id !== projectId);
      setLocalItem('biocode_projects', JSON.stringify(list));
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  async getProjectSequences(projectId: string): Promise<SequenceRecord[]> {
    if (!projectId || !isSupabaseConfigured) return [];
    try {
      // 1. Join table records (project_sequences junction table if exists)
      let psIds: string[] = [];
      try {
        const { data: psData, error: psErr } = await supabase.from('project_sequences').select('sequence_id').eq('project_id', projectId);
        if (!psErr && psData) {
          psIds = psData.map((row: any) => row.sequence_id).filter(Boolean);
        }
      } catch {}

      // 2. Project analyses sequence references (REAL relationship in existing live schema)
      let anaSeqIds: string[] = [];
      try {
        const { data: anaData, error: anaErr } = await supabase.from('analyses').select('sequence_id').eq('project_id', projectId);
        if (!anaErr && anaData) {
          anaSeqIds = anaData.map((a: any) => a.sequence_id).filter(Boolean);
        }
      } catch {}

      const allIds = Array.from(new Set([...psIds, ...anaSeqIds]));

      if (allIds.length === 0) return [];

      const { data: sequences, error } = await supabase
        .from('sequence_records')
        .select('*')
        .in('id', allIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (sequences || []).map((s: any) => ({
        id: s.id,
        user_id: s.user_id,
        source: s.source || 'Direct Input',
        accession: s.accession,
        version: s.version,
        organism: s.organism,
        molecule_type: s.molecule_type,
        sequence_type: s.sequence_type,
        definition: s.definition,
        total_length: s.total_length || 0,
        topology: s.topology,
        sequence: s.sequence,
        metadata: s.metadata,
        created_at: s.created_at,
        updated_at: s.updated_at
      }));
    } catch (err: any) {
      console.warn('[BioService] getProjectSequences error:', err?.message || err);
      return [];
    }
  },

  async addSequenceToProject(projectId: string, sequenceId: string): Promise<boolean> {
    if (!projectId || !sequenceId) {
      throw new Error('Project ID and Sequence ID are required.');
    }

    if (!isSupabaseConfigured) return true;

    let success = false;
    let lastError = '';

    // 1. Try project_sequences junction table
    try {
      const { error: psUpsertErr } = await supabase
        .from('project_sequences')
        .upsert(
          { project_id: projectId, sequence_id: sequenceId },
          { onConflict: 'project_id,sequence_id' }
        );

      if (!psUpsertErr) {
        success = true;
      } else {
        lastError = psUpsertErr.message;
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }

    // 2. Primary/fallback relationship via `analyses` table (present in live schema)
    try {
      const { data: existingAna } = await supabase
        .from('analyses')
        .select('id')
        .eq('project_id', projectId)
        .eq('sequence_id', sequenceId)
        .maybeSingle();

      if (existingAna) {
        success = true;
      } else {
        const { error: anaInsErr } = await supabase
          .from('analyses')
          .insert({
            id: generateUUID(),
            project_id: projectId,
            sequence_id: sequenceId,
            analysis_type: 'Sequence Association',
            analysis_scope: 'Complete Sequence',
            status: 'Completed',
            result_summary: 'Sequence associated with project',
            results: { associated_at: new Date().toISOString() }
          });

        if (!anaInsErr) {
          success = true;
        } else {
          lastError = anaInsErr.message;
        }
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }

    if (!success) {
      throw new Error(`Failed to associate sequence with project: ${lastError}`);
    }

    requestManager.invalidateCache();
    return true;
  },

  async removeSequenceFromProject(projectId: string, sequenceId: string): Promise<boolean> {
    if (!projectId || !sequenceId) {
      throw new Error('Project ID and Sequence ID are required.');
    }

    if (!isSupabaseConfigured) return true;

    // 1. Delete from project_sequences if exists
    try {
      await supabase
        .from('project_sequences')
        .delete()
        .eq('project_id', projectId)
        .eq('sequence_id', sequenceId);
    } catch {}

    // 2. Delete association records from analyses
    try {
      await supabase
        .from('analyses')
        .delete()
        .eq('project_id', projectId)
        .eq('sequence_id', sequenceId);
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  async getProjectAnalyses(projectId: string): Promise<AnalysisRecord[]> {
    if (!projectId || !isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('analyses')
        .select('*, sequence_records(*)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((a: any) => ({
        id: a.id,
        user_id: a.user_id,
        sequence_id: a.sequence_id,
        project_id: a.project_id,
        analysis_type: a.analysis_type,
        analysis_scope: a.analysis_scope || 'Complete Sequence',
        total_sequence_length: a.total_sequence_length || 0,
        analyzed_length: a.analyzed_length || 0,
        sequence_type: a.sequence_type,
        input_source: a.input_source,
        status: a.status,
        result_summary: a.result_summary,
        results: a.results,
        created_at: a.created_at,
        updated_at: a.updated_at,
        sequence_record: a.sequence_records || null
      }));
    } catch (err) {
      console.warn('[BioService] getProjectAnalyses error:', err);
      return [];
    }
  },

  async getProjectVersions(projectId: string): Promise<any[]> {
    if (!projectId || !isSupabaseConfigured) return [];
    try {
      const analyses = await this.getProjectAnalyses(projectId);
      const safeAnalyses = Array.isArray(analyses) ? analyses : [];
      const versions: any[] = [];

      safeAnalyses.forEach((ana) => {
        const results = ana.results || {};
        const verNum = results.versionNumber || (ana.result_summary?.includes('V2') ? 2 : 1);
        const mutations = Array.isArray(results.mutations) ? results.mutations : [];

        versions.push({
          id: `${ana.id}-v${verNum}`,
          analysisId: ana.id,
          sequenceId: ana.sequence_id,
          accession: ana.sequence_record?.accession || ana.input_source || 'Sequence Record',
          versionNumber: verNum,
          label: verNum === 2 ? `V2 — Modified (${mutations.length} mutations)` : 'V1 — Original',
          sequenceType: ana.sequence_type,
          analysisType: ana.analysis_type,
          mutations,
          status: ana.status,
          created_at: ana.created_at,
          summary: ana.result_summary
        });
      });

      return versions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (err) {
      console.warn('[BioService] getProjectVersions error:', err);
      return [];
    }
  },

  async getProjectActivities(projectId: string): Promise<any[]> {
    if (!projectId || !isSupabaseConfigured) return [];
    try {
      const [project, sequences, analyses] = await Promise.all([
        this.getProjectById(projectId),
        this.getProjectSequences(projectId),
        this.getProjectAnalyses(projectId)
      ]);

      const activities: any[] = [];

      if (project?.created_at) {
        activities.push({
          id: `act-proj-${project.id}`,
          type: 'PROJECT_CREATED',
          title: 'Project Created',
          description: `Created research workspace "${project.name}"`,
          timestamp: project.created_at
        });
      }

      const safeSeqs = Array.isArray(sequences) ? sequences : [];
      safeSeqs.forEach((seq) => {
        activities.push({
          id: `act-seq-${seq.id}`,
          type: 'SEQUENCE_ADDED',
          title: 'Sequence Associated',
          description: `Linked sequence ${seq.accession || 'record'} (${seq.organism || 'Homo sapiens'}, ${(seq.total_length || 0).toLocaleString()} ${seq.sequence_type === 'PROTEIN' ? 'aa' : 'bp'})`,
          timestamp: seq.created_at
        });
      });

      const safeAnas = Array.isArray(analyses) ? analyses : [];
      safeAnas.forEach((ana) => {
        const verNum = ana.results?.versionNumber || 1;
        const isV2 = verNum === 2 || (ana.result_summary || '').includes('V2');

        activities.push({
          id: `act-ana-${ana.id}`,
          type: isV2 ? 'V2_CREATED' : 'ANALYSIS_COMPLETED',
          title: isV2 ? 'Version 2 (Mutated) Analysis Executed' : 'Analysis Pipeline Executed',
          description: `${ana.analysis_type} executed on ${ana.input_source || 'sequence'} (${(ana.analyzed_length || 0).toLocaleString()} ${ana.sequence_type === 'PROTEIN' ? 'aa' : 'bp'})`,
          timestamp: ana.created_at
        });

        if (isV2 && Array.isArray(ana.results?.mutations) && ana.results.mutations.length > 0) {
          activities.push({
            id: `act-comp-${ana.id}`,
            type: 'COMPARISON_GENERATED',
            title: 'Biophysical Impact Comparison Generated',
            description: `Generated side-by-side comparative delta report across ${ana.results.mutations.length} mutations`,
            timestamp: ana.created_at
          });
        }
      });

      return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (err) {
      console.warn('[BioService] getProjectActivities error:', err);
      return [];
    }
  },

  /**
   * System Statistics Aggregator
   * Calculates real Supabase data when connected:
   * Total Analyses: COUNT from analyses
   * Sequences Processed: COUNT or SUM from sequence_records / analyses
   * Active Projects: COUNT from projects
   */
  async getSystemStats(userId?: string, forceRefresh: boolean = false): Promise<SystemStats> {
    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured) {
          const localProj = JSON.parse(getLocalItem('biocode_projects', '[]'));
          const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
          const totalBp = localAna.reduce((acc: number, curr: any) => acc + (curr.analyzed_length || curr.total_sequence_length || 0), 0);
          return {
            totalAnalyses: localAna.length,
            activeProjects: localProj.filter((p: any) => p.status === 'Active').length || localProj.length,
            sequencesProcessed: totalBp,
            systemStatus: 'Unconfigured',
            persistenceStorage: 'local_fallback'
          };
        }

        try {
          // 1. Fetch exact analysis count and lengths from Supabase
          const { count: anaCount, error: anaCountErr } = await supabase
            .from('analyses')
            .select('*', { count: 'exact', head: true });

          // 2. Fetch active projects count from Supabase
          const { count: projCount, error: projCountErr } = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true });

          // 3. Fetch sequence records or analyzed lengths for sequence processed aggregation
          const { data: anaRows, error: anaRowsErr } = await supabase
            .from('analyses')
            .select('analyzed_length, total_sequence_length');

          if (anaCountErr || projCountErr) {
            if (requestManager.isRateLimitError(anaCountErr || projCountErr)) {
              throw anaCountErr || projCountErr;
            }
          }

          const totalAnalyses = typeof anaCount === 'number' ? anaCount : 0;
          const activeProjects = typeof projCount === 'number' ? projCount : 0;
          
          const totalBp = (anaRows || []).reduce((acc: number, curr: any) => {
            return acc + (Number(curr.analyzed_length) || Number(curr.total_sequence_length) || 0);
          }, 0);

          return {
            totalAnalyses,
            activeProjects,
            sequencesProcessed: totalBp,
            systemStatus: 'Connected',
            persistenceStorage: 'supabase'
          };
        } catch (e: any) {
          if (requestManager.isRateLimitError(e)) throw e;
          console.warn('[BioService] Real Supabase stats query failed, checking local storage:', e?.message || e);
          try {
            const localProj = JSON.parse(getLocalItem('biocode_projects', '[]'));
            const localAna = JSON.parse(getLocalItem('biocode_analyses', '[]'));
            const totalBp = localAna.reduce((acc: number, curr: any) => acc + (curr.analyzed_length || curr.total_sequence_length || 0), 0);
            return {
              totalAnalyses: localAna.length,
              activeProjects: localProj.filter((p: any) => p.status === 'Active').length || localProj.length,
              sequencesProcessed: totalBp,
              systemStatus: 'Error',
              persistenceStorage: 'local_fallback'
            };
          } catch {
            return {
              totalAnalyses: 0,
              activeProjects: 0,
              sequencesProcessed: 0,
              systemStatus: 'Offline',
              persistenceStorage: 'local_fallback'
            };
          }
        }
      },
      {
        key: `getSystemStats_${userId || 'anon'}`,
        ttlMs: 30000,
        forceRefresh
      }
    );
  },

  /**
   * Save a mutated / edited sequence version record
   */
  async saveSequenceVersion(
    versionData: Omit<SequenceVersionRecord, 'id' | 'created_at'> & {
      sequence_id?: string | null;
      accession?: string | null;
      original_sequence?: string | null;
      modified_sequence?: string | null;
      mutation_summary?: any;
    }
  ): Promise<PersistenceResult<SequenceVersionRecord>> {
    const versionId = generateUUID();
    const now = new Date().toISOString();
    const seqRecId = isValidUUID(versionData.sequence_record_id) 
      ? versionData.sequence_record_id 
      : isValidUUID(versionData.sequence_id) 
      ? versionData.sequence_id 
      : null;

    const record: SequenceVersionRecord = {
      id: versionId,
      sequence_record_id: seqRecId,
      parent_version_id: isValidUUID(versionData.parent_version_id) ? versionData.parent_version_id : null,
      version_number: versionData.version_number || 2,
      sequence_data: versionData.sequence_data || versionData.modified_sequence || '',
      changes: versionData.changes || [],
      original_length: versionData.original_length || 0,
      modified_length: versionData.modified_length || (versionData.sequence_data ? versionData.sequence_data.length : 0),
      total_changes: versionData.total_changes || (versionData.changes ? versionData.changes.length : 0),
      status: versionData.status || 'Completed',
      metadata: versionData.metadata || {},
      created_at: now,
      updated_at: now
    };

    console.log(`[SEQUENCE_VERSION] Save attempt: Version v${record.version_number} | original length: ${record.original_length} | modified length: ${record.modified_length} | changes count: ${record.total_changes}`);

    // Always persist to local storage for immediate session resilience
    try {
      const localVersions = JSON.parse(getLocalItem('biocode_sequence_versions', '[]'));
      const filtered = localVersions.filter((v: any) => v.id !== record.id);
      setLocalItem('biocode_sequence_versions', JSON.stringify([record, ...filtered].slice(0, 100)));
    } catch (localErr) {
      console.warn('[SEQUENCE_VERSION] Local storage write notice:', localErr);
    }

    if (isSupabaseConfigured) {
      try {
        const payload: any = {
          id: record.id,
          sequence_id: seqRecId,
          sequence_record_id: seqRecId,
          parent_version_id: record.parent_version_id,
          accession: versionData.accession || record.metadata?.accession || record.metadata?.parentSequenceId || null,
          original_sequence: versionData.original_sequence || record.metadata?.originalSequence || null,
          modified_sequence: record.sequence_data,
          sequence_data: record.sequence_data,
          version_number: record.version_number,
          mutation_summary: versionData.mutation_summary || record.metadata?.mutationSummary || {
            totalChanges: record.total_changes,
            originalLength: record.original_length,
            modifiedLength: record.modified_length
          },
          changes: record.changes,
          change_type: 'modification',
          original_length: record.original_length,
          modified_length: record.modified_length,
          total_changes: record.total_changes,
          status: record.status,
          metadata: record.metadata
        };

        const { data, error } = await supabase
          .from('sequence_versions')
          .insert(payload)
          .select()
          .single();

        if (error) {
          throw new Error(`Supabase sequence_versions insert failed: ${error.message}`);
        }

        console.log(`[SEQUENCE_VERSION] Save result (Supabase): Success id=${record.id} v${record.version_number}`);

        dbLogger.log({
          operation: 'SAVE_ANALYSIS',
          status: 'SUCCESS',
          storage: 'supabase',
          message: `Sequence version v${record.version_number} saved to Supabase.`
        });

        return {
          data: (data || record) as SequenceVersionRecord,
          storage: 'supabase',
          message: `Sequence version v${record.version_number} securely saved to Supabase Cloud.`
        };
      } catch (err: any) {
        console.warn(`[SEQUENCE_VERSION] Save result (Local Recovery): v${record.version_number} fallback due to: ${err.message}`);
        dbLogger.log({
          operation: 'SAVE_ANALYSIS',
          status: 'RECOVERY_QUEUED',
          storage: 'local_recovery',
          message: `Sequence version v${record.version_number} saved locally. Cloud persistence note: ${err.message}`,
          error: err.message
        });

        return {
          data: record,
          storage: 'local_recovery',
          message: `Sequence version v${record.version_number} saved to local session storage.`,
          warning: err.message
        };
      }
    }

    console.log(`[SEQUENCE_VERSION] Save result (Local Mode): Version v${record.version_number} saved to local session store.`);
    return {
      data: record,
      storage: 'local_recovery',
      message: `Sequence version v${record.version_number} saved to local session storage.`
    };
  },

  /**
   * Retrieve sequence versions for a given sequence record
   */
  async getSequenceVersions(sequenceRecordId?: string | null): Promise<SequenceVersionRecord[]> {
    if (isSupabaseConfigured && sequenceRecordId && isValidUUID(sequenceRecordId)) {
      try {
        const { data, error } = await supabase
          .from('sequence_versions')
          .select('*')
          .or(`sequence_record_id.eq.${sequenceRecordId},sequence_id.eq.${sequenceRecordId}`)
          .order('version_number', { ascending: false });

        if (!error && data && data.length > 0) {
          return data as SequenceVersionRecord[];
        }
      } catch (e) {
        console.warn('[BioService] Error fetching versions from Supabase:', e);
      }
    }

    // Fallback to local storage
    try {
      const localVersions = JSON.parse(getLocalItem('biocode_sequence_versions', '[]'));
      if (sequenceRecordId) {
        return localVersions.filter(
          (v: any) => v.sequence_record_id === sequenceRecordId || v.sequence_id === sequenceRecordId
        );
      }
      return localVersions;
    } catch {
      return [];
    }
  }
};
