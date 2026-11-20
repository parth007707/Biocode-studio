/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Helper function with static variable references so Vite replaces them at build/serve time
const getSupabaseUrl = (): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_SUPABASE_URL) return import.meta.env.VITE_SUPABASE_URL;
      if ((import.meta.env as any).SUPABASE_URL) return (import.meta.env as any).SUPABASE_URL;
    }
  } catch {}

  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
      if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
    }
  } catch {}

  return '';
};

const getSupabaseAnonKey = (): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_SUPABASE_ANON_KEY) return import.meta.env.VITE_SUPABASE_ANON_KEY;
      if ((import.meta.env as any).SUPABASE_ANON_KEY) return (import.meta.env as any).SUPABASE_ANON_KEY;
    }
  } catch {}

  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
      if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
    }
  } catch {}

  return '';
};

export const rawSupabaseUrl = getSupabaseUrl().trim();
export const rawSupabaseAnonKey = getSupabaseAnonKey().trim();

export const DEV_AUTH_BYPASS = true;
export const AUTH_REQUIRED = false;

export const isSupabaseConfigured = Boolean(
  rawSupabaseUrl && 
  rawSupabaseAnonKey && 
  rawSupabaseUrl !== 'YOUR_SUPABASE_URL' &&
  rawSupabaseUrl !== 'https://YOUR_SUPABASE_URL' &&
  rawSupabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
  (rawSupabaseUrl.startsWith('http://') || rawSupabaseUrl.startsWith('https://'))
);

if (!isSupabaseConfigured) {
  console.warn('[Supabase] Environment variables missing. Configure VITE_SUPABASE_URL (or SUPABASE_URL) and VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY).');
} else {
  console.info(`[Supabase] Client initialized for ${rawSupabaseUrl.slice(0, 25)}...`);
}

export const supabase = createClient(
  isSupabaseConfigured ? rawSupabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? rawSupabaseAnonKey : 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export function getSanitizedSupabaseConfig() {
  return {
    isConfigured: isSupabaseConfigured,
    maskedUrl: rawSupabaseUrl ? (rawSupabaseUrl.length > 25 ? `${rawSupabaseUrl.slice(0, 25)}...` : rawSupabaseUrl) : 'Missing',
    hasAnonKey: Boolean(rawSupabaseAnonKey && rawSupabaseAnonKey !== 'placeholder-key'),
    maskedKey: rawSupabaseAnonKey ? `${rawSupabaseAnonKey.slice(0, 8)}...${rawSupabaseAnonKey.slice(-6)}` : 'Missing'
  };
}

let inFlightAnonSessionPromise: Promise<any> | null = null;
let inMemoryGuestScopeId: string | null = null;
const ANON_DISABLED_KEY = 'biocode_anon_signin_disabled';
const GUEST_SCOPE_KEY = 'biocode_guest_scope_id';

function generateScopeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a persistent per-visitor browser scope ID used to isolate local guest state
 * when Supabase anonymous auth is disabled or unconfigured.
 */
export function getOrCreateGuestScopeId(): string {
  if (inMemoryGuestScopeId) return inMemoryGuestScopeId;
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(GUEST_SCOPE_KEY);
      if (existing && existing.trim()) {
        inMemoryGuestScopeId = existing.trim();
        return inMemoryGuestScopeId;
      }
      const created = `guest_${generateScopeUuid()}`;
      localStorage.setItem(GUEST_SCOPE_KEY, created);
      inMemoryGuestScopeId = created;
      return created;
    }
  } catch {}
  inMemoryGuestScopeId = `guest_${generateScopeUuid()}`;
  return inMemoryGuestScopeId;
}

/**
 * Ensures every public visitor gets an isolated anonymous Supabase auth session (auth.uid()).
 * Deduplicates concurrent calls and fails safely if anonymous sign-in is disabled.
 */
export async function ensureAnonymousSession(): Promise<any | null> {
  if (!isSupabaseConfigured) return null;

  if (inFlightAnonSessionPromise) {
    return inFlightAnonSessionPromise;
  }

  inFlightAnonSessionPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        return session.user;
      }

      try {
        if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
          if (sessionStorage.getItem(ANON_DISABLED_KEY) === '1') {
            return null;
          }
        }
      } catch {}

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('disabled') || (error as any).code === 'anonymous_provider_disabled') {
          try {
            if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(ANON_DISABLED_KEY, '1');
            }
          } catch {}
        }
        console.warn('[Supabase] Anonymous sign-in unavailable:', error.message);
        return null;
      }
      return data?.user ?? null;
    } catch (err: any) {
      console.warn('[Supabase] Anonymous session initialization error:', err?.message || err);
      return null;
    } finally {
      inFlightAnonSessionPromise = null;
    }
  })();

  return inFlightAnonSessionPromise;
}

/**
 * Returns the current authenticated/anonymous Supabase user ID if available.
 */
export async function getActiveSupabaseUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export function isAnonymousProviderDisabled(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(ANON_DISABLED_KEY) === '1';
    }
  } catch {}
  return false;
}

/**
 * Links an email & password to the active Supabase anonymous session,
 * preserving the exact same auth.uid() and all owned records without losing work.
 */
export async function linkAnonymousAccountWithEmail(
  email: string,
  password: string
): Promise<{ user: any | null; message: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this environment.');
  }
  const cleanEmail = email.trim();
  if (!cleanEmail || !password || password.length < 6) {
    throw new Error('A valid email and a password of at least 6 characters are required.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error('No active cloud anonymous session found. If anonymous sign-ins are disabled on Supabase, use Portable Workspace Backup below to preserve your work.');
  }

  const { data, error } = await supabase.auth.updateUser({
    email: cleanEmail,
    password
  });

  if (error) {
    throw new Error(error.message || 'Failed to link email to current workspace.');
  }

  return {
    user: data?.user ?? session.user,
    message: 'Workspace linked! Check your inbox if email confirmation is enabled, or recover this workspace anytime with your email and password.'
  };
}

/**
 * Recovers a previously linked workspace session using email & password.
 */
export async function recoverWorkspaceWithEmail(
  email: string,
  password: string
): Promise<{ user: any | null; message: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this environment.');
  }
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) {
    throw new Error('Email and password are required to recover your workspace.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password
  });

  if (error) {
    throw new Error(error.message || 'Workspace recovery sign-in failed.');
  }

  return {
    user: data?.user ?? null,
    message: 'Workspace session restored successfully.'
  };
}

/**
 * Sends a passwordless recovery link for a previously linked workspace email.
 */
export async function sendWorkspaceRecoveryMagicLink(email: string): Promise<{ message: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this environment.');
  }
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Please enter your linked workspace email address.');
  }

  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false
    }
  });

  if (error) {
    throw new Error(error.message || 'Unable to send workspace recovery link.');
  }

  return {
    message: 'Recovery link sent. Open the link on this browser to restore your workspace session.'
  };
}
