export type NavItem = 
  | 'dashboard'
  | 'analysis'
  | 'ai-assistant'
  | 'projects'
  | 'history'
  | 'settings';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id?: string | null;
  name: string;
  organism?: string;
  description: string;
  research_objective?: string;
  tags?: string[] | string;
  project_type?: string;
  sequencesCount?: number;
  analysesCount?: number;
  modifiedVersionsCount?: number;
  lastUpdated?: string;
  lastActivity?: string;
  status: 'Active' | 'Archived' | 'Processing';
  created_at: string;
  updated_at: string;
}

export interface SequenceRecord {
  id: string;
  user_id?: string | null;
  project_id?: string | null;
  source: string;
  accession: string;
  version?: string | null;
  organism?: string | null;
  molecule_type?: string | null;
  sequence_type?: string | null;
  definition?: string | null;
  total_length: number;
  topology?: string | null;
  sequence?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at?: string;
}

export interface TargetSequence {
  accession: string;
  definition?: string;
  organism?: string;
  sequenceType: string;
  totalLength: number;
  sequence: string;
  id?: string;
}

export * from '../lib/bio/editor/types';

export interface AnalysisRecord {
  id: string;
  user_id?: string | null;
  sequence_id?: string | null;
  project_id?: string | null;
  analysis_type: string;
  analysis_scope: string; // 'Complete Sequence' | 'Selected Region' | 'Custom'
  total_sequence_length: number;
  analyzed_length: number;
  sequence_type: string; // 'DNA' | 'RNA' | 'PROTEIN' | string
  input_source: string;
  status: 'Completed' | 'Pending' | 'Failed';
  result_summary?: string | null;
  results?: any; // Structured JSON analysis output
  created_at: string;
  updated_at: string;
  sequence_record?: SequenceRecord | null;
  _is_local_fallback?: boolean;
}

export interface PersistenceResult<T> {
  data: T;
  storage: 'supabase' | 'local_fallback' | 'local_recovery';
  warning?: string | null;
  error?: string | null;
  message?: string;
  sequenceId?: string;
  analysisId?: string;
  sync_status?: 'synced' | 'pending';
}

export interface SaveCompletedAnalysisInput {
  projectId?: string;
  sequenceInfo: {
    project_id?: string;
    source?: string;
    accession: string;
    version?: string | null;
    organism?: string | null;
    molecule_type?: string | null;
    sequence_type?: string | null;
    definition?: string | null;
    total_length: number;
    topology?: string | null;
    sequence?: string | null;
    metadata?: Record<string, any>;
  };
  analysisInfo: {
    project_id?: string;
    analysis_type: string;
    analysis_scope?: string;
    total_sequence_length?: number;
    analyzed_length?: number;
    sequence_type: string;
    input_source?: string;
    result_summary?: string | null;
    results?: any;
    status?: 'Completed' | 'Pending' | 'Failed';
  };
}

export interface PendingRecoveryRecord {
  id: string;
  timestamp: string;
  userId?: string | null;
  sequencePayload: any;
  analysisPayload: any;
  sync_status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  lastError?: string;
}

export type SupabaseConnectionState = 
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CONFIGURATION_ERROR'
  | 'DATABASE_ERROR'
  | 'OFFLINE';

export type SupabaseErrorCategory =
  | 'MISSING_ENV'
  | 'NETWORK_FAILURE'
  | 'SERVICE_UNAVAILABLE'
  | 'SCHEMA_MISSING'
  | 'RLS_DENIED'
  | 'UNKNOWN';

export interface SchemaHealthStatus {
  state: SupabaseConnectionState;
  isConfigured: boolean;
  connected: boolean;
  tables: {
    sequence_records: boolean;
    analyses: boolean;
    projects: boolean;
    project_sequences: boolean;
    sequence_versions: boolean;
  };
  missingTables: string[];
  errorCategory?: SupabaseErrorCategory;
  errorMessage: string | null;
  checkedAt: string;
}

export interface SystemStats {
  totalAnalyses: number;
  activeProjects: number;
  sequencesProcessed: number;
  systemStatus: 'Connected' | 'Connecting' | 'Unconfigured' | 'Error' | 'Schema Incomplete' | 'Offline';
  persistenceStorage?: 'supabase' | 'local_fallback';
}

export function formatOrganism(org: any): string {
  if (!org) return '';
  if (typeof org === 'string') return org;
  if (typeof org === 'object') {
    const sciName = org.scientificname || org.scientificName || org.name;
    const commName = org.commonname || org.commonName;
    const taxId = org.taxid || org.taxId;
    if (sciName) {
      if (commName) return `${sciName} (${commName})`;
      return String(sciName);
    }
    if (commName) return String(commName);
    if (taxId) return `TaxID: ${taxId}`;
    try {
      return JSON.stringify(org);
    } catch {
      return String(org);
    }
  }
  return String(org);
}

// ============================================================================
// AI ASSISTANT CONTEXT & CONVERSATION TYPES
// ============================================================================

export type AiContextType = 'dashboard' | 'sequence' | 'project' | 'history';

export interface AiSequenceContext {
  type: 'sequence';
  sequenceId?: string;
  accession: string;
  sequenceType?: string;
  organism?: string;
  definition?: string;
  sequenceLength?: number;
  sequenceData?: string;
  selectedAnalysis?: string;
  analysisMetrics?: Record<string, any>;
  interpretation?: string;
  versionInfo?: string;
  mutations?: any[];
  projectId?: string;
}

export interface AiProjectContext {
  type: 'project';
  projectId?: string;
  projectName: string;
  organism?: string;
  researchObjective?: string;
  associatedSequences?: Array<{ accession: string; definition?: string; length?: number; type?: string }>;
  availableAnalyses?: string[];
  availableVersionsCount?: number;
  recentActivity?: string[];
}

export interface AiDashboardContext {
  type: 'dashboard';
  totalSequences?: number;
  totalProjects?: number;
  totalAnalyses?: number;
  availableModules?: string[];
}

export interface AiHistoryContext {
  type: 'history';
  analysisId?: string;
  accession: string;
  analysisType: string;
  sequenceType?: string;
  resultSummary?: string;
  results?: any;
}

export type AiContextData = 
  | AiSequenceContext 
  | AiProjectContext 
  | AiDashboardContext 
  | AiHistoryContext;

export interface AiMessage {
  id: string;
  conversation_id?: string;
  user_id?: string;
  sender: 'user' | 'ai';
  role: 'user' | 'model' | 'assistant';
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface AiConversation {
  id: string;
  user_id?: string;
  project_id?: string;
  sequence_id?: string;
  title: string;
  context_type: AiContextType;
  context_summary?: Record<string, any>;
  created_at: string;
  updated_at: string;
  messages?: AiMessage[];
}
