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
