import { supabase, isSupabaseConfigured, getActiveSupabaseUserId, getOrCreateGuestScopeId } from '../lib/supabase/client';
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

async function resolveEffectiveUserId(explicitUserId?: string | null): Promise<string | null> {
  if (isValidUUID(explicitUserId)) return explicitUserId!.trim();
  if (isSupabaseConfigured) {
    const activeUid = await getActiveSupabaseUserId();
    if (isValidUUID(activeUid)) return activeUid;
  }
  return null;
}

function getScopedKey(base: string, effectiveUserId?: string | null): string {
  const scopeId = isValidUUID(effectiveUserId) ? effectiveUserId!.trim() : getOrCreateGuestScopeId();
  return `${base}_${scopeId}`;
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
  getLocalAnalysesCache(userId?: string | null): AnalysisRecord[] {
    try {
      const uid = isValidUUID(userId) ? userId!.trim() : null;
      const raw = getLocalItem(getScopedKey('biocode_analyses', uid), '[]');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async getPendingRecoveryQueueCount(userId?: string | null): Promise<number> {
    try {
      const uid = await resolveEffectiveUserId(userId);
      if (!isSupabaseConfigured || !uid) return 0;
      const raw = getLocalItem(getScopedKey('pending_analysis_queue', uid), '[]');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  },
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
      const effectiveUserId = await resolveEffectiveUserId();

      if (!effectiveUserId) {
        return {
          reachable: true,
          canSelect: false,
          canInsert: false,
          error: 'Active visitor/user session required by RLS for cloud round-trip verification.',
          durationMs: Date.now() - startTime
        };
      }

      // 1. Test Select strictly scoped to visitor
      const selectRes = await supabase
        .from('sequence_versions')
        .select('id, version_number, sequence_data, created_at')
        .eq('user_id', effectiveUserId)
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

      // 2. Test Insert a test verification record scoped to current user
      const testId = generateUUID();
      const insertRes = await supabase
        .from('sequence_versions')
        .insert({
          id: testId,
          user_id: effectiveUserId,
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
          await supabase.from('sequence_versions').delete().eq('id', testId).eq('user_id', effectiveUserId);
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
    const validUserId = await resolveEffectiveUserId(userId);

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
    if (isSupabaseConfigured && validUserId) {
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

        // Update scoped local cache for smooth offline instant retrieval
        try {
          const anaKey = getScopedKey('biocode_analyses', validUserId);
          const localAna = JSON.parse(getLocalItem(anaKey, '[]'));
          const updated = [completeRecord, ...localAna.filter((a: any) => a.id !== completeRecord.id)];
          setLocalItem(anaKey, JSON.stringify(updated.slice(0, 100)));
        } catch {}

        requestManager.invalidateCache();

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
    } else if (isSupabaseConfigured && !validUserId) {
      return this.handleOfflineRecoverySave(seqPayload, anaPayload, 'Anonymous session unavailable for cloud persistence');
    } else {
      console.warn('[BioService] Supabase not configured, saving to scoped local storage.');
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
   * Internal helper to store failed/offline analyses in the scoped pending recovery queue & caches
   */
  handleOfflineRecoverySave(
    seqPayload: any,
    anaPayload: any,
    errorMessage: string
  ): PersistenceResult<AnalysisRecord> {
    const recoveryId = anaPayload.id || generateUUID();
    const now = new Date().toISOString();
    const scopeUid = isValidUUID(anaPayload.user_id) ? anaPayload.user_id : (isValidUUID(seqPayload.user_id) ? seqPayload.user_id : null);

    const pendingItem: PendingRecoveryRecord = {
      id: recoveryId,
      timestamp: now,
      userId: scopeUid,
      sequencePayload: seqPayload,
      analysisPayload: anaPayload,
      sync_status: 'pending',
      attempts: 1,
      lastError: errorMessage
    };

    const canUseCloud = isSupabaseConfigured && isValidUUID(scopeUid);

    // 1. Add to scoped pending recovery queue (only when Supabase cloud session is active)
    if (canUseCloud) {
      try {
        const queueKey = getScopedKey('pending_analysis_queue', scopeUid);
        const queue: PendingRecoveryRecord[] = JSON.parse(getLocalItem(queueKey, '[]'));
        queue.unshift(pendingItem);
        setLocalItem(queueKey, JSON.stringify(queue.slice(0, 50)));
      } catch {}
    }

    // 2. Add to scoped local history & sequence caches
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
      const anaKey = getScopedKey('biocode_analyses', scopeUid);
      const localAna = JSON.parse(getLocalItem(anaKey, '[]'));
      localAna.unshift(fallbackRecord);
      setLocalItem(anaKey, JSON.stringify(localAna.slice(0, 100)));

      const seqKey = getScopedKey('biocode_sequence_records', scopeUid);
      const localSeq = JSON.parse(getLocalItem(seqKey, '[]'));
      localSeq.unshift(fallbackSeqRecord);
      setLocalItem(seqKey, JSON.stringify(localSeq.slice(0, 100)));
    } catch {}

    requestManager.invalidateCache();

    dbLogger.log({
      operation: 'SAVE_ANALYSIS',
      status: canUseCloud ? 'RECOVERY_QUEUED' : 'SUCCESS',
      sequenceId: seqPayload.id,
      analysisId: recoveryId,
      accession: seqPayload.accession,
      pipeline: anaPayload.analysis_type,
      storage: canUseCloud ? 'local_recovery' : 'local_cache',
      message: canUseCloud
        ? 'Cloud save failed. Saved temporarily to local recovery storage.'
        : 'Saved to isolated visitor browser workspace.',
      error: canUseCloud ? errorMessage : undefined
    });

    return {
      data: fallbackRecord,
      storage: canUseCloud ? 'local_recovery' : 'local_fallback',
      message: canUseCloud
        ? 'Cloud save failed. Saved temporarily to local recovery storage.'
        : 'Saved to isolated visitor browser workspace.',
      warning: canUseCloud ? errorMessage : undefined,
      error: canUseCloud ? errorMessage : undefined,
      sequenceId: seqPayload.id,
      analysisId: recoveryId,
      sync_status: canUseCloud ? 'pending' : 'synced'
    };
  },

  /**
   * Automatic background synchronization of pending recovery queue items when Supabase returns online
   */
  async syncPendingRecoveryQueue(userId?: string): Promise<{ syncedCount: number; failedCount: number }> {
    if (!isSupabaseConfigured || typeof window === 'undefined' || typeof localStorage === 'undefined') return { syncedCount: 0, failedCount: 0 };

    const effectiveUserId = await resolveEffectiveUserId(userId);
    if (!effectiveUserId) return { syncedCount: 0, failedCount: 0 };

    try {
      const queueKey = getScopedKey('pending_analysis_queue', effectiveUserId);
      const queueRaw = localStorage.getItem(queueKey);
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
          const seqPayload = { ...item.sequencePayload, user_id: effectiveUserId };
          delete seqPayload.project_id;
          delete seqPayload._is_local_fallback;

          if (!isValidUUID(seqPayload.id)) {
            seqPayload.id = generateUUID();
          }

          const anaPayload = { ...item.analysisPayload, user_id: effectiveUserId };
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

      localStorage.setItem(queueKey, JSON.stringify(remainingQueue));
      requestManager.invalidateCache();
      return { syncedCount, failedCount };
    } catch (err) {
      console.warn('[BioService] Error in syncPendingRecoveryQueue:', err);
      return { syncedCount: 0, failedCount: 0 };
    }
  },

  /**
   * Sequence Records Service
   * Strictly isolated per visitor/anonymous session ID (auth.uid()).
   */
  async getSequenceRecords(userId?: string, forceRefresh: boolean = false): Promise<SequenceRecord[]> {
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_sequence_records', effectiveUserId);

    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured || !effectiveUserId) {
          try {
            const local = getLocalItem(localKey, '[]');
            return JSON.parse(local);
          } catch {
            return [];
          }
        }

        try {
          const { data, error } = await supabase
            .from('sequence_records')
            .select('*')
            .eq('user_id', effectiveUserId)
            .order('created_at', { ascending: false });

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

          // Cache locally per visitor scope for offline resiliency
          try {
            setLocalItem(localKey, JSON.stringify(cloudRecords.slice(0, 100)));
          } catch {}

          return cloudRecords;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.error('[BioService] Exception in getSequenceRecords:', err?.message || err);
          throw err;
        }
      },
      {
        key: `seq_records_${effectiveUserId || 'guest'}`,
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
    const validUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_sequence_records', validUserId);

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

    if (!isSupabaseConfigured || !validUserId) {
      try {
        const list = JSON.parse(getLocalItem(localKey, '[]'));
        list.unshift(newRecord);
        setLocalItem(localKey, JSON.stringify(list.slice(0, 100)));
      } catch {}
      requestManager.invalidateCache();
      return {
        data: newRecord,
        storage: 'local_fallback',
        warning: isSupabaseConfigured ? undefined : 'Supabase is not configured. Saved to local storage fallback.'
      };
    }

    try {
      const insertPayload: any = {
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
        metadata: record.metadata || {}
      };

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

  async deleteSequenceRecord(sequenceId: string, userId?: string): Promise<boolean> {
    if (!sequenceId) throw new Error('Sequence ID is required.');
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_sequence_records', effectiveUserId);

    if (isSupabaseConfigured && effectiveUserId) {
      const { error } = await supabase
        .from('sequence_records')
        .delete()
        .eq('id', sequenceId)
        .eq('user_id', effectiveUserId);

      if (error) throw new Error(error.message || 'Failed to delete sequence record.');
    }

    try {
      const local = getLocalItem(localKey, '[]');
      const list = JSON.parse(local).filter((s: any) => s.id !== sequenceId);
      setLocalItem(localKey, JSON.stringify(list));
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  /**
   * Analyses Service
   * Strictly isolated per visitor/anonymous session ID (auth.uid()).
   */
  async getAnalyses(userId?: string, forceRefresh: boolean = false): Promise<AnalysisRecord[]> {
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_analyses', effectiveUserId);

    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured || !effectiveUserId) {
          try {
            const local = getLocalItem(localKey, '[]');
            return JSON.parse(local);
          } catch {
            return [];
          }
        }

        try {
          // 1. Fetch sequence records belonging strictly to this visitor
          const sequenceRecords = await this.getSequenceRecords(effectiveUserId, forceRefresh);
          const seqMap = new Map<string, SequenceRecord>();
          sequenceRecords.forEach(s => seqMap.set(s.id, s));

          // 2. Fetch analyses strictly owned by this visitor
          const { data: analysesData, error: anaError } = await supabase
            .from('analyses')
            .select('*')
            .eq('user_id', effectiveUserId)
            .order('created_at', { ascending: false });

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

          // Merge only this visitor's unsynced pending recovery items
          try {
            const queueRaw = getLocalItem(getScopedKey('pending_analysis_queue', effectiveUserId), '[]');
            const queue: PendingRecoveryRecord[] = JSON.parse(queueRaw);
            queue.forEach((item) => {
              if (item.userId === effectiveUserId && !combinedMap.has(item.id)) {
                combinedMap.set(item.id, {
                  ...item.analysisPayload,
                  id: item.id,
                  created_at: item.timestamp,
                  updated_at: item.timestamp,
                  sequence_record: item.sequencePayload ? {
                    ...item.sequencePayload,
                    created_at: item.timestamp,
                    updated_at: item.timestamp
                  } : null,
                  _is_local_fallback: true
                });
              }
            });
          } catch {}

          const finalRecords = Array.from(combinedMap.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          try {
            setLocalItem(localKey, JSON.stringify(finalRecords.slice(0, 100)));
          } catch {}

          return finalRecords;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.warn('[BioService] Exception in getAnalyses, using scoped local storage fallback:', err?.message || err);
          try {
            const local = getLocalItem(localKey, '[]');
            return JSON.parse(local);
          } catch {
            return [];
          }
        }
      },
      {
        key: `getAnalyses_${effectiveUserId || 'guest'}`,
        ttlMs: 30000,
        forceRefresh
      }
    );
  },

  /**
   * Fetch a single analysis record by ID from Supabase strictly scoped to visitor.
   */
  async getAnalysisById(id: string, userId?: string, forceRefresh: boolean = false): Promise<AnalysisRecord | null> {
    if (!id) return null;
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localAnaKey = getScopedKey('biocode_analyses', effectiveUserId);
    const localSeqKey = getScopedKey('biocode_sequence_records', effectiveUserId);

    return requestManager.execute(
      async () => {
        console.log('[BioService] getAnalysisById called for ID:', id);

        dbLogger.log({
          operation: 'REOPEN_ANALYSIS',
          status: 'START',
          analysisId: id,
          message: `Fetching analysis details for canonical ID ${id}...`
        });

        // If Supabase is not configured or no anonymous session is active, search scoped local caches
        if (!isSupabaseConfigured || !effectiveUserId) {
          try {
            const localAna = JSON.parse(getLocalItem(localAnaKey, '[]'));
            const foundAna = localAna.find((a: any) => a.id === id);
            if (foundAna) return foundAna;

            const localSeq = JSON.parse(getLocalItem(localSeqKey, '[]'));
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
          // 1. Search the `analyses` table strictly scoped to effectiveUserId
          const { data: anaData, error: anaError } = await supabase
            .from('analyses')
            .select('*')
            .eq('id', id)
            .eq('user_id', effectiveUserId)
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
                .eq('user_id', effectiveUserId)
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

          // 2. If not found in `analyses`, check if ID corresponds directly to a `sequence_records` row owned by visitor
          const { data: seqData, error: seqError } = await supabase
            .from('sequence_records')
            .select('*')
            .eq('id', id)
            .eq('user_id', effectiveUserId)
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

          // 3. Fallback to scoped local recovery storage
          const localAna = JSON.parse(getLocalItem(localAnaKey, '[]'));
          const foundAna = localAna.find((a: any) => a.id === id);
          if (foundAna) return { ...foundAna, _is_local_fallback: true };

          return null;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.error('[BioService] Error in getAnalysisById:', err);
          try {
            const localAna = JSON.parse(getLocalItem(localAnaKey, '[]'));
            const found = localAna.find((a: any) => a.id === id);
            if (found) return found;
          } catch {}
          throw err;
        }
      },
      {
        key: `getAnalysisById_${id}_${effectiveUserId || 'guest'}`,
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
    const validUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_analyses', validUserId);
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
      _is_local_fallback: !isSupabaseConfigured || !validUserId
    };

    if (!isSupabaseConfigured || !validUserId) {
      try {
        const local = getLocalItem(localKey, '[]');
        const list = JSON.parse(local);
        list.unshift(newRecord);
        setLocalItem(localKey, JSON.stringify(list.slice(0, 100)));
      } catch {}
      requestManager.invalidateCache();
      return {
        data: newRecord,
        storage: 'local_fallback',
        warning: isSupabaseConfigured ? undefined : 'Supabase is not configured. Saved to local storage.'
      };
    }

    try {
      const insertData: any = {
        id: generatedId,
        user_id: validUserId,
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

  async deleteAnalysis(analysisId: string, userId?: string): Promise<boolean> {
    if (!analysisId) throw new Error('Analysis ID is required.');
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_analyses', effectiveUserId);

    if (isSupabaseConfigured && effectiveUserId) {
      const { error } = await supabase
        .from('analyses')
        .delete()
        .eq('id', analysisId)
        .eq('user_id', effectiveUserId);

      if (error) throw new Error(error.message || 'Failed to delete analysis record.');
    }

    try {
      const local = getLocalItem(localKey, '[]');
      const list = JSON.parse(local).filter((a: any) => a.id !== analysisId);
      setLocalItem(localKey, JSON.stringify(list));
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  /**
   * Projects Service
   */
  async getProjects(userId?: string, forceRefresh: boolean = false): Promise<Project[]> {
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_projects', effectiveUserId);

    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured || !effectiveUserId) {
          try {
            const localProjs: Project[] = JSON.parse(getLocalItem(localKey, '[]'));
            const localAna: AnalysisRecord[] = JSON.parse(getLocalItem(getScopedKey('biocode_analyses', effectiveUserId), '[]'));
            const localLinks: any[] = JSON.parse(getLocalItem(getScopedKey('biocode_project_sequences', effectiveUserId), '[]'));

            return localProjs.map((p) => {
              const projAnalyses = localAna.filter((a) => a.project_id === p.id);
              const projLinks = localLinks.filter((ps) => ps.project_id === p.id);
              const seqSet = new Set<string>();
              projLinks.forEach((ps) => ps.sequence_id && seqSet.add(ps.sequence_id));
              projAnalyses.forEach((a) => a.sequence_id && seqSet.add(a.sequence_id));

              const modifiedCount = projAnalyses.filter((a) => {
                const res = a.results || {};
                return res.versionNumber === 2 || (Array.isArray(res.mutations) && res.mutations.length > 0);
              }).length;

              const timestamps: number[] = [
                new Date(p.created_at).getTime(),
                new Date(p.updated_at || p.created_at).getTime(),
                ...projAnalyses.map((a) => new Date(a.created_at).getTime()),
                ...projLinks.map((ps) => new Date(ps.created_at).getTime())
              ].filter((t) => !isNaN(t));

              const latestMs = Math.max(...timestamps, 0);

              return {
                ...p,
                sequencesCount: seqSet.size,
                analysesCount: projAnalyses.length,
                modifiedVersionsCount: modifiedCount,
                lastUpdated: p.updated_at || p.created_at,
                lastActivity: latestMs > 0 ? new Date(latestMs).toISOString() : p.created_at
              };
            });
          } catch {
            return [];
          }
        }

        try {
          const { data: projData, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', effectiveUserId)
            .order('created_at', { ascending: false });

          if (error) {
            console.warn('[BioService] Supabase projects query error:', error.message || error);
            if (requestManager.isRateLimitError(error)) throw error;
            try {
              const local = getLocalItem(localKey, '[]');
              return JSON.parse(local);
            } catch {
              return [];
            }
          }

          const projectsList = projData || [];
          if (projectsList.length === 0) return [];

          const projectIds = projectsList.map((p: any) => p.id);

          // Concurrent fetch for metrics calculation scoped strictly to effectiveUserId
          const [analysesRes, projSeqRes] = await Promise.all([
            supabase
              .from('analyses')
              .select('id, project_id, sequence_id, created_at, results')
              .in('project_id', projectIds)
              .eq('user_id', effectiveUserId),
            supabase
              .from('project_sequences')
              .select('project_id, sequence_id, created_at')
              .in('project_id', projectIds)
              .eq('user_id', effectiveUserId)
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
            setLocalItem(localKey, JSON.stringify(cloudProjects.slice(0, 50)));
          } catch {}

          return cloudProjects;
        } catch (err: any) {
          if (requestManager.isRateLimitError(err)) throw err;
          console.warn('[BioService] Exception in getProjects, using scoped local fallback:', err?.message || err);
          try {
            const local = getLocalItem(localKey, '[]');
            return JSON.parse(local);
          } catch {
            return [];
          }
        }
      },
      {
        key: `getProjects_${effectiveUserId || 'guest'}`,
        ttlMs: 30000,
        forceRefresh
      }
    );
  },

  async getProjectById(projectId: string, userId?: string): Promise<Project | null> {
    if (!projectId) return null;
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const projects = await this.getProjects(effectiveUserId || undefined, true);
    const found = projects.find((p) => p.id === projectId);
    if (found) return found;

    if (!isSupabaseConfigured || !effectiveUserId) return null;

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('user_id', effectiveUserId)
        .single();
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
    const validUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_projects', validUserId);

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

    if (!isSupabaseConfigured || !validUserId) {
      try {
        const list: Project[] = JSON.parse(getLocalItem(localKey, '[]'));
        if (list.some((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
          throw new Error(`A project named "${trimmedName}" already exists. Please choose a unique project name.`);
        }
        list.unshift(newProj);
        setLocalItem(localKey, JSON.stringify(list.slice(0, 50)));
      } catch (err: any) {
        if (err?.message?.includes('already exists')) throw err;
      }
      requestManager.invalidateCache();
      return newProj;
    }

    // Check duplicate name for current visitor
    try {
      const { data: existing } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', validUserId)
        .ilike('name', trimmedName);
      if (existing && existing.length > 0) {
        throw new Error(`A project named "${trimmedName}" already exists. Please choose a unique project name.`);
      }
    } catch (dupErr: any) {
      if (dupErr.message && dupErr.message.includes('already exists')) {
        throw dupErr;
      }
    }

    try {
      const baseInsertData: any = {
        id: generatedId,
        user_id: validUserId,
        name: trimmedName,
        organism: project.organism || 'Homo sapiens',
        description: (project.description || '').trim(),
        project_type: project.project_type || 'Genomic Analysis',
        status: project.status || 'Active'
      };
      const extendedInsertData: any = {
        ...baseInsertData,
        research_objective: (project.research_objective || '').trim(),
        tags: parsedTags
      };

      let { data, error } = await supabase
        .from('projects')
        .insert(extendedInsertData)
        .select()
        .single();

      if (error && (error.code === 'PGRST204' || error.code === '42703' || (error.message || '').includes('column'))) {
        const fallbackRes = await supabase
          .from('projects')
          .insert(baseInsertData)
          .select()
          .single();
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

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
        research_objective: data.research_objective || newProj.research_objective || '',
        tags: Array.isArray(data.tags) ? data.tags : parsedTags,
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

  async updateProject(projectId: string, updates: Partial<Project>, userId?: string): Promise<Project> {
    if (!projectId) throw new Error('Project ID is required.');
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_projects', effectiveUserId);

    const updatePayload: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) updatePayload.name = updates.name.trim();
    if (updates.description !== undefined) updatePayload.description = updates.description.trim();
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.organism !== undefined) updatePayload.organism = updates.organism;
    if (updates.project_type !== undefined) updatePayload.project_type = updates.project_type;

    const extendedPayload: any = { ...updatePayload };
    if (updates.research_objective !== undefined) extendedPayload.research_objective = updates.research_objective.trim();
    if (updates.tags !== undefined) extendedPayload.tags = Array.isArray(updates.tags) ? updates.tags : [];

    if (isSupabaseConfigured && effectiveUserId) {
      let { data, error } = await supabase
        .from('projects')
        .update(extendedPayload)
        .eq('id', projectId)
        .eq('user_id', effectiveUserId)
        .select()
        .single();

      if (error && (error.code === 'PGRST204' || error.code === '42703' || (error.message || '').includes('column'))) {
        const fallbackRes = await supabase
          .from('projects')
          .update(updatePayload)
          .eq('id', projectId)
          .eq('user_id', effectiveUserId)
          .select()
          .single();
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) throw new Error(error.message || 'Failed to update project.');
      requestManager.invalidateCache();
      return {
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        organism: data.organism,
        description: data.description || '',
        research_objective: data.research_objective || updates.research_objective || '',
        tags: Array.isArray(data.tags) ? data.tags : Array.isArray(updates.tags) ? updates.tags : [],
        project_type: data.project_type,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    }

    const list: Project[] = JSON.parse(getLocalItem(localKey, '[]'));
    const existing = list.find((p) => p.id === projectId);
    const updatedProj: Project = {
      ...(existing || ({} as any)),
      ...updates,
      id: projectId,
      updated_at: updatePayload.updated_at
    };
    const nextList = list.some((p) => p.id === projectId)
      ? list.map((p) => (p.id === projectId ? updatedProj : p))
      : [updatedProj, ...list];
    setLocalItem(localKey, JSON.stringify(nextList));
    requestManager.invalidateCache();
    return updatedProj;
  },

  async archiveProject(projectId: string, userId?: string): Promise<Project> {
    return this.updateProject(projectId, { status: 'Archived' }, userId);
  },

  async deleteProject(projectId: string, userId?: string): Promise<boolean> {
    if (!projectId) throw new Error('Project ID is required.');
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const localKey = getScopedKey('biocode_projects', effectiveUserId);

    if (isSupabaseConfigured && effectiveUserId) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', effectiveUserId);

      if (error) throw new Error(error.message || 'Failed to delete project.');
    }

    try {
      const local = getLocalItem(localKey, '[]');
      const list = JSON.parse(local).filter((p: any) => p.id !== projectId);
      setLocalItem(localKey, JSON.stringify(list));
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  async getProjectSequences(projectId: string, userId?: string): Promise<SequenceRecord[]> {
    if (!projectId) return [];
    const effectiveUserId = await resolveEffectiveUserId(userId);

    if (!isSupabaseConfigured || !effectiveUserId) {
      try {
        const links: any[] = JSON.parse(getLocalItem(getScopedKey('biocode_project_sequences', effectiveUserId), '[]'));
        const localAna: AnalysisRecord[] = JSON.parse(getLocalItem(getScopedKey('biocode_analyses', effectiveUserId), '[]'));
        const localSeqs: SequenceRecord[] = JSON.parse(getLocalItem(getScopedKey('biocode_sequence_records', effectiveUserId), '[]'));

        const ids = new Set<string>();
        links.filter((l) => l.project_id === projectId && l.sequence_id).forEach((l) => ids.add(l.sequence_id));
        localAna.filter((a) => a.project_id === projectId && a.sequence_id).forEach((a) => ids.add(a.sequence_id!));

        if (ids.size === 0) return [];
        return localSeqs.filter((s) => ids.has(s.id));
      } catch {
        return [];
      }
    }

    try {
      // 1. Join table records scoped to visitor
      let psIds: string[] = [];
      try {
        const { data: psData, error: psErr } = await supabase
          .from('project_sequences')
          .select('sequence_id')
          .eq('project_id', projectId)
          .eq('user_id', effectiveUserId);
        if (!psErr && psData) {
          psIds = psData.map((row: any) => row.sequence_id).filter(Boolean);
        }
      } catch {}

      // 2. Project analyses sequence references scoped to visitor
      let anaSeqIds: string[] = [];
      try {
        const { data: anaData, error: anaErr } = await supabase
          .from('analyses')
          .select('sequence_id')
          .eq('project_id', projectId)
          .eq('user_id', effectiveUserId);
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
        .eq('user_id', effectiveUserId)
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

  async addSequenceToProject(projectId: string, sequenceId: string, userId?: string): Promise<boolean> {
    if (!projectId || !sequenceId) {
      throw new Error('Project ID and Sequence ID are required.');
    }

    const effectiveUserId = await resolveEffectiveUserId(userId);

    if (!isSupabaseConfigured || !effectiveUserId) {
      try {
        const key = getScopedKey('biocode_project_sequences', effectiveUserId);
        const links: any[] = JSON.parse(getLocalItem(key, '[]'));
        const exists = links.some((l) => l.project_id === projectId && l.sequence_id === sequenceId);
        if (!exists) {
          links.unshift({
            project_id: projectId,
            sequence_id: sequenceId,
            user_id: effectiveUserId || null,
            created_at: new Date().toISOString()
          });
          setLocalItem(key, JSON.stringify(links));
        }
      } catch {}
      requestManager.invalidateCache();
      return true;
    }

    let success = false;
    let lastError = '';

    // 1. Try project_sequences junction table with user_id
    try {
      const { error: psUpsertErr } = await supabase
        .from('project_sequences')
        .upsert(
          { project_id: projectId, sequence_id: sequenceId, user_id: effectiveUserId },
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

    // 2. Primary/fallback relationship via `analyses` table scoped to visitor
    try {
      const { data: existingAna } = await supabase
        .from('analyses')
        .select('id')
        .eq('project_id', projectId)
        .eq('sequence_id', sequenceId)
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      if (existingAna) {
        success = true;
      } else {
        const { error: anaInsErr } = await supabase
          .from('analyses')
          .insert({
            id: generateUUID(),
            user_id: effectiveUserId,
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

  async removeSequenceFromProject(projectId: string, sequenceId: string, userId?: string): Promise<boolean> {
    if (!projectId || !sequenceId) {
      throw new Error('Project ID and Sequence ID are required.');
    }

    const effectiveUserId = await resolveEffectiveUserId(userId);

    if (!isSupabaseConfigured || !effectiveUserId) {
      try {
        const linksKey = getScopedKey('biocode_project_sequences', effectiveUserId);
        const links = JSON.parse(getLocalItem(linksKey, '[]')).filter(
          (l: any) => !(l.project_id === projectId && l.sequence_id === sequenceId)
        );
        setLocalItem(linksKey, JSON.stringify(links));

        const anaKey = getScopedKey('biocode_analyses', effectiveUserId);
        const analyses = JSON.parse(getLocalItem(anaKey, '[]')).filter(
          (a: any) => !(a.project_id === projectId && a.sequence_id === sequenceId)
        );
        setLocalItem(anaKey, JSON.stringify(analyses));
      } catch {}
      requestManager.invalidateCache();
      return true;
    }

    // 1. Delete from project_sequences scoped to visitor
    try {
      await supabase
        .from('project_sequences')
        .delete()
        .eq('project_id', projectId)
        .eq('sequence_id', sequenceId)
        .eq('user_id', effectiveUserId);
    } catch {}

    // 2. Delete association records from analyses scoped to visitor
    try {
      await supabase
        .from('analyses')
        .delete()
        .eq('project_id', projectId)
        .eq('sequence_id', sequenceId)
        .eq('user_id', effectiveUserId);
    } catch {}

    requestManager.invalidateCache();
    return true;
  },

  async getProjectAnalyses(projectId: string, userId?: string): Promise<AnalysisRecord[]> {
    if (!projectId) return [];
    const effectiveUserId = await resolveEffectiveUserId(userId);

    if (!isSupabaseConfigured || !effectiveUserId) {
      try {
        const localAna: AnalysisRecord[] = JSON.parse(getLocalItem(getScopedKey('biocode_analyses', effectiveUserId), '[]'));
        return localAna.filter((a) => a.project_id === projectId);
      } catch {
        return [];
      }
    }

    try {
      const { data, error } = await supabase
        .from('analyses')
        .select('*, sequence_records(*)')
        .eq('project_id', projectId)
        .eq('user_id', effectiveUserId)
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

  async getProjectVersions(projectId: string, userId?: string): Promise<any[]> {
    if (!projectId) return [];
    try {
      const analyses = await this.getProjectAnalyses(projectId, userId);
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

  async getProjectActivities(projectId: string, userId?: string): Promise<any[]> {
    if (!projectId) return [];
    try {
      const [project, sequences, analyses] = await Promise.all([
        this.getProjectById(projectId, userId),
        this.getProjectSequences(projectId, userId),
        this.getProjectAnalyses(projectId, userId)
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
   * Strictly isolated per visitor/anonymous session ID.
   */
  async getSystemStats(userId?: string, forceRefresh: boolean = false): Promise<SystemStats> {
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const projLocalKey = getScopedKey('biocode_projects', effectiveUserId);
    const anaLocalKey = getScopedKey('biocode_analyses', effectiveUserId);

    return requestManager.execute(
      async () => {
        if (!isSupabaseConfigured || !effectiveUserId) {
          const localProj = JSON.parse(getLocalItem(projLocalKey, '[]'));
          const localAna = JSON.parse(getLocalItem(anaLocalKey, '[]'));
          const totalBp = localAna.reduce((acc: number, curr: any) => acc + (curr.analyzed_length || curr.total_sequence_length || 0), 0);
          return {
            totalAnalyses: localAna.length,
            activeProjects: localProj.filter((p: any) => p.status === 'Active').length || localProj.length,
            sequencesProcessed: totalBp,
            systemStatus: isSupabaseConfigured ? 'Connected' : 'Unconfigured',
            persistenceStorage: 'local_fallback'
          };
        }

        try {
          // 1. Fetch exact analysis count scoped to effectiveUserId
          const { count: anaCount, error: anaCountErr } = await supabase
            .from('analyses')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', effectiveUserId);

          // 2. Fetch active projects count scoped to effectiveUserId
          const { count: projCount, error: projCountErr } = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', effectiveUserId);

          // 3. Fetch analyzed lengths scoped to effectiveUserId
          const { data: anaRows } = await supabase
            .from('analyses')
            .select('analyzed_length, total_sequence_length')
            .eq('user_id', effectiveUserId);

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
          console.warn('[BioService] Real Supabase stats query failed, checking scoped local storage:', e?.message || e);
          try {
            const localProj = JSON.parse(getLocalItem(projLocalKey, '[]'));
            const localAna = JSON.parse(getLocalItem(anaLocalKey, '[]'));
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
        key: `getSystemStats_${effectiveUserId || 'guest'}`,
        ttlMs: 30000,
        forceRefresh
      }
    );
  },

  /**
   * Save a mutated / edited sequence version record scoped to visitor
   */
  async saveSequenceVersion(
    versionData: Omit<SequenceVersionRecord, 'id' | 'created_at'> & {
      sequence_id?: string | null;
      accession?: string | null;
      original_sequence?: string | null;
      modified_sequence?: string | null;
      mutation_summary?: any;
      user_id?: string | null;
    },
    userId?: string
  ): Promise<PersistenceResult<SequenceVersionRecord>> {
    const versionId = generateUUID();
    const now = new Date().toISOString();
    const effectiveUserId = await resolveEffectiveUserId(userId || versionData.user_id);
    const verLocalKey = getScopedKey('biocode_sequence_versions', effectiveUserId);

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

    // Persist to scoped local storage for immediate session resilience
    try {
      const localVersions = JSON.parse(getLocalItem(verLocalKey, '[]'));
      const filtered = localVersions.filter((v: any) => v.id !== record.id);
      setLocalItem(verLocalKey, JSON.stringify([record, ...filtered].slice(0, 100)));
    } catch (localErr) {
      console.warn('[SEQUENCE_VERSION] Local storage write notice:', localErr);
    }

    if (isSupabaseConfigured && effectiveUserId) {
      try {
        const payload: any = {
          id: record.id,
          user_id: effectiveUserId,
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
   * Retrieve sequence versions for a given sequence record scoped to visitor
   */
  async getSequenceVersions(sequenceRecordId?: string | null, userId?: string): Promise<SequenceVersionRecord[]> {
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const verLocalKey = getScopedKey('biocode_sequence_versions', effectiveUserId);

    if (isSupabaseConfigured && effectiveUserId && sequenceRecordId && isValidUUID(sequenceRecordId)) {
      try {
        const { data, error } = await supabase
          .from('sequence_versions')
          .select('*')
          .eq('user_id', effectiveUserId)
          .or(`sequence_record_id.eq.${sequenceRecordId},sequence_id.eq.${sequenceRecordId}`)
          .order('version_number', { ascending: false });

        if (!error && data && data.length > 0) {
          return data as SequenceVersionRecord[];
        }
      } catch (e) {
        console.warn('[BioService] Error fetching versions from Supabase:', e);
      }
    }

    // Fallback to scoped local storage
    try {
      const localVersions = JSON.parse(getLocalItem(verLocalKey, '[]'));
      if (sequenceRecordId) {
        return localVersions.filter(
          (v: any) => v.sequence_record_id === sequenceRecordId || v.sequence_id === sequenceRecordId
        );
      }
      return localVersions;
    } catch {
      return [];
    }
  },

  /**
   * Exports all records strictly owned by the active visitor as a portable backup snapshot.
   */
  async exportWorkspaceSnapshot(userId?: string): Promise<{
    schemaVersion: number;
    exportedAt: string;
    workspaceScope: string;
    projects: Project[];
    sequences: SequenceRecord[];
    analyses: AnalysisRecord[];
    versions: SequenceVersionRecord[];
    projectLinks: Array<{ project_id: string; sequence_id: string; created_at?: string }>;
  }> {
    const effectiveUserId = await resolveEffectiveUserId(userId);
    const scopeId = isValidUUID(effectiveUserId) ? effectiveUserId! : getOrCreateGuestScopeId();

    const [projects, sequences, analyses, versions] = await Promise.all([
      this.getProjects(effectiveUserId || undefined, true),
      this.getSequenceRecords(effectiveUserId || undefined, true),
      this.getAnalyses(effectiveUserId || undefined, true),
      this.getSequenceVersions(undefined, effectiveUserId || undefined)
    ]);

    let projectLinks: Array<{ project_id: string; sequence_id: string; created_at?: string }> = [];
    if (isSupabaseConfigured && effectiveUserId) {
      try {
        const { data } = await supabase
          .from('project_sequences')
          .select('project_id, sequence_id, created_at')
          .eq('user_id', effectiveUserId);
        if (Array.isArray(data)) projectLinks = data;
      } catch {}
    } else {
      try {
        projectLinks = JSON.parse(getLocalItem(getScopedKey('biocode_project_sequences', effectiveUserId), '[]'));
      } catch {}
    }

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      workspaceScope: scopeId,
      projects,
      sequences,
      analyses,
      versions,
      projectLinks
    };
  },

  /**
   * Restores/merges a portable workspace snapshot into the active visitor's workspace
   * without deleting or overwriting any existing records.
   */
  async importWorkspaceSnapshot(
    snapshot: any,
    userId?: string
  ): Promise<{ projectsImported: number; sequencesImported: number; analysesImported: number; versionsImported: number }> {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid workspace backup payload.');
    }

    const effectiveUserId = await resolveEffectiveUserId(userId);
    const projects: any[] = Array.isArray(snapshot.projects) ? snapshot.projects : [];
    const sequences: any[] = Array.isArray(snapshot.sequences) ? snapshot.sequences : [];
    const analyses: any[] = Array.isArray(snapshot.analyses) ? snapshot.analyses : [];
    const versions: any[] = Array.isArray(snapshot.versions) ? snapshot.versions : [];
    const projectLinks: any[] = Array.isArray(snapshot.projectLinks) ? snapshot.projectLinks : [];

    let projectsImported = 0;
    let sequencesImported = 0;
    let analysesImported = 0;
    let versionsImported = 0;

    if (isSupabaseConfigured && effectiveUserId) {
      for (const p of projects) {
        if (!p?.id || !p?.name) continue;
        const { error } = await supabase.from('projects').upsert(
          {
            id: p.id,
            user_id: effectiveUserId,
            name: p.name,
            organism: p.organism || 'Homo sapiens',
            description: p.description || '',
            research_objective: p.research_objective || '',
            tags: Array.isArray(p.tags) ? p.tags : [],
            project_type: p.project_type || 'Genomic Analysis',
            status: p.status || 'Active',
            created_at: p.created_at || new Date().toISOString(),
            updated_at: p.updated_at || new Date().toISOString()
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
        if (!error) projectsImported++;
      }

      for (const s of sequences) {
        if (!s?.id || !s?.accession) continue;
        const { error } = await supabase.from('sequence_records').upsert(
          {
            id: s.id,
            user_id: effectiveUserId,
            source: s.source || 'Workspace Backup',
            accession: s.accession,
            version: s.version || null,
            organism: s.organism || 'Homo sapiens',
            molecule_type: s.molecule_type || null,
            sequence_type: s.sequence_type || 'Genomic DNA',
            definition: s.definition || s.accession,
            total_length: s.total_length || 0,
            topology: s.topology || 'linear',
            sequence: s.sequence || null,
            metadata: s.metadata || {},
            created_at: s.created_at || new Date().toISOString(),
            updated_at: s.updated_at || new Date().toISOString()
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
        if (!error) sequencesImported++;
      }

      for (const l of projectLinks) {
        if (!l?.project_id || !l?.sequence_id) continue;
        try {
          await supabase.from('project_sequences').upsert(
            { project_id: l.project_id, sequence_id: l.sequence_id, user_id: effectiveUserId },
            { onConflict: 'project_id,sequence_id', ignoreDuplicates: true }
          );
        } catch {}
      }

      for (const a of analyses) {
        if (!a?.id) continue;
        const { error } = await supabase.from('analyses').upsert(
          {
            id: a.id,
            user_id: effectiveUserId,
            sequence_id: isValidUUID(a.sequence_id) ? a.sequence_id : null,
            project_id: isValidUUID(a.project_id) ? a.project_id : null,
            analysis_type: a.analysis_type || 'Sequence Analysis',
            analysis_scope: a.analysis_scope || 'Complete Sequence',
            total_sequence_length: a.total_sequence_length || 0,
            analyzed_length: a.analyzed_length || 0,
            sequence_type: a.sequence_type || 'DNA',
            input_source: a.input_source || 'Workspace Backup',
            status: a.status || 'Completed',
            result_summary: a.result_summary || null,
            results: a.results || {},
            created_at: a.created_at || new Date().toISOString(),
            updated_at: a.updated_at || new Date().toISOString()
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
        if (!error) analysesImported++;
      }

      for (const v of versions) {
        if (!v?.id) continue;
        const { error } = await supabase.from('sequence_versions').upsert(
          {
            id: v.id,
            user_id: effectiveUserId,
            sequence_id: isValidUUID(v.sequence_record_id || (v as any).sequence_id) ? (v.sequence_record_id || (v as any).sequence_id) : null,
            sequence_record_id: isValidUUID(v.sequence_record_id || (v as any).sequence_id) ? (v.sequence_record_id || (v as any).sequence_id) : null,
            sequence_data: v.sequence_data || '',
            version_number: v.version_number || 2,
            changes: v.changes || [],
            original_length: v.original_length || 0,
            modified_length: v.modified_length || 0,
            total_changes: v.total_changes || 0,
            status: v.status || 'Completed',
            metadata: v.metadata || {},
            created_at: v.created_at || new Date().toISOString(),
            updated_at: v.updated_at || new Date().toISOString()
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
        if (!error) versionsImported++;
      }
    } else {
      const mergeById = (keyName: string, items: any[], rebindUser: boolean = true) => {
        const key = getScopedKey(keyName, effectiveUserId);
        const existing: any[] = JSON.parse(getLocalItem(key, '[]'));
        const existingIds = new Set(existing.map((item) => item.id));
        let added = 0;
        for (const item of items) {
          if (!item?.id || existingIds.has(item.id)) continue;
          existing.push(rebindUser ? { ...item, user_id: effectiveUserId || item.user_id } : item);
          existingIds.add(item.id);
          added++;
        }
        setLocalItem(key, JSON.stringify(existing));
        return added;
      };

      projectsImported = mergeById('biocode_projects', projects);
      sequencesImported = mergeById('biocode_sequence_records', sequences);
      analysesImported = mergeById('biocode_analyses', analyses);
      versionsImported = mergeById('biocode_sequence_versions', versions);

      const linksKey = getScopedKey('biocode_project_sequences', effectiveUserId);
      const existingLinks: any[] = JSON.parse(getLocalItem(linksKey, '[]'));
      for (const l of projectLinks) {
        if (!l?.project_id || !l?.sequence_id) continue;
        if (!existingLinks.some((e) => e.project_id === l.project_id && e.sequence_id === l.sequence_id)) {
          existingLinks.push({ ...l, user_id: effectiveUserId || null });
        }
      }
      setLocalItem(linksKey, JSON.stringify(existingLinks));
    }

    requestManager.invalidateCache();
    return { projectsImported, sequencesImported, analysesImported, versionsImported };
  },

  /**
   * Migrates any unlinked local browser guest records into an authenticated/anonymous Supabase user
   * when transitioning from local guest fallback to a cloud session without losing work.
   */
  async migrateLocalGuestToUser(targetUserId: string): Promise<void> {
    if (!isSupabaseConfigured || !isValidUUID(targetUserId)) return;
    const guestScope = getOrCreateGuestScopeId();
    if (!guestScope || guestScope === targetUserId) return;

    const markerKey = `biocode_migrated_${guestScope}_to_${targetUserId}`;
    if (getLocalItem(markerKey, '') === '1') return;

    try {
      const projects = JSON.parse(getLocalItem(`biocode_projects_${guestScope}`, '[]'));
      const sequences = JSON.parse(getLocalItem(`biocode_sequence_records_${guestScope}`, '[]'));
      const analyses = JSON.parse(getLocalItem(`biocode_analyses_${guestScope}`, '[]'));
      const versions = JSON.parse(getLocalItem(`biocode_sequence_versions_${guestScope}`, '[]'));
      const projectLinks = JSON.parse(getLocalItem(`biocode_project_sequences_${guestScope}`, '[]'));

      if (projects.length || sequences.length || analyses.length || versions.length || projectLinks.length) {
        await this.importWorkspaceSnapshot(
          { projects, sequences, analyses, versions, projectLinks },
          targetUserId
        );
      }
      setLocalItem(markerKey, '1');
    } catch (err) {
      console.warn('[BioService] Guest-to-cloud migration deferred:', err);
    }
  }
};
