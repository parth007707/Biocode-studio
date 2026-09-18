/**
 * Database Operation Logger for BioCode Studio
 * Provides structured, developer-friendly logging for database transactions,
 * persistence verification, offline queues, and schema health checks.
 * Completely sanitizes logs to never expose sensitive API keys or tokens.
 */

export interface DBLogEntry {
  id: string;
  timestamp: string;
  operation: 'SAVE_ANALYSIS' | 'SAVE_SEQUENCE' | 'HEALTH_CHECK' | 'SYNC_OFFLINE_QUEUE' | 'FETCH_HISTORY' | 'REOPEN_ANALYSIS';
  status: 'START' | 'SUCCESS' | 'FAILED' | 'RECOVERY_QUEUED' | 'RECOVERY_SYNCED';
  sequenceId?: string | null;
  analysisId?: string | null;
  accession?: string | null;
  source?: string | null;
  pipeline?: string | null;
  storage?: 'supabase' | 'local_recovery' | 'local_cache';
  durationMs?: number;
  message: string;
  details?: Record<string, any>;
  error?: string | null;
}

type LogListener = (logs: DBLogEntry[]) => void;

class DatabaseLogger {
  private logs: DBLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 200;

  constructor() {
    // Load existing logs from session storage if available
    try {
      const saved = sessionStorage.getItem('biocode_db_debug_logs');
      if (saved) {
        this.logs = JSON.parse(saved).slice(0, this.maxLogs);
      }
    } catch {
      this.logs = [];
    }
  }

  public log(entry: Omit<DBLogEntry, 'id' | 'timestamp'>): DBLogEntry {
    const fullEntry: DBLogEntry = {
      ...entry,
      id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      details: this.sanitize(entry.details)
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    try {
      sessionStorage.setItem('biocode_db_debug_logs', JSON.stringify(this.logs));
    } catch {}

    // Output formatted console message for developer transparency
    const statusColor = fullEntry.status === 'SUCCESS' || fullEntry.status === 'RECOVERY_SYNCED' 
      ? '#10b981' 
      : fullEntry.status === 'START' 
      ? '#3b82f6' 
      : '#f59e0b';
    
    console.log(
      `%c[DB Log] [${fullEntry.operation}] [${fullEntry.status}]%c ${fullEntry.message}`,
      `color: ${statusColor}; font-weight: bold;`,
      'color: inherit;',
      {
        accession: fullEntry.accession,
        sequenceId: fullEntry.sequenceId,
        analysisId: fullEntry.analysisId,
        storage: fullEntry.storage,
        duration: fullEntry.durationMs ? `${fullEntry.durationMs}ms` : undefined,
        error: fullEntry.error
      }
    );

    this.notifyListeners();
    return fullEntry;
  }

  public getLogs(): DBLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    try {
      sessionStorage.removeItem('biocode_db_debug_logs');
    } catch {}
    this.notifyListeners();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.getLogs());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const current = this.getLogs();
    this.listeners.forEach((l) => {
      try {
        l(current);
      } catch (err) {
        console.error('[DBLogger] Listener error:', err);
      }
    });
  }

  /**
   * Sanitizes object payloads to remove any potential secret keys or authorization tokens
   */
  private sanitize(obj?: Record<string, any>): Record<string, any> | undefined {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('key') || 
          lowerKey.includes('secret') || 
          lowerKey.includes('token') || 
          lowerKey.includes('auth') || 
          lowerKey.includes('password')
        ) {
          sanitized[key] = '***REDACTED***';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitize(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    } catch {
      return { sanitized: true };
    }
  }
}

export const dbLogger = new DatabaseLogger();
