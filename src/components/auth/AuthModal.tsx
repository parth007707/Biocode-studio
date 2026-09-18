import React, { useState } from 'react';
import { Dna, Mail, Lock, User, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

interface AuthModalProps {
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        console.log('[Auth] signUp result:', { user: data?.user, session: data?.session, error });

        if (error) {
          console.error('[Auth] signUp error:', error);
          throw error;
        }

        if (data?.session) {
          setSuccessMsg('Account created successfully! Redirecting...');
          setTimeout(onSuccess, 800);
        } else {
          setSuccessMsg('Registration successful! Please check your email for confirmation.');
        }
      } else if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        console.log('[Auth Debug] signInWithPassword result:', { user: data?.user, session: data?.session, error });

        if (error) {
          console.error('Sign-in error:', error);
          throw error;
        }

        if (data.session) {
          setSuccessMsg('Signed in successfully!');
          setTimeout(onSuccess, 800);
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) throw error;
        setSuccessMsg('Password reset instructions sent to your email address.');
      }
    } catch (err: any) {
      console.error('[Auth Debug] Authentication exception:', err);
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials')) {
        setErrorMsg('Invalid email or password. Please verify your credentials, or if you do not have an account yet, please click "Sign up" below.');
      } else {
        setErrorMsg(msg || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getAuthRedirectUrl = () => {
    return `${window.location.origin}/auth/callback`;
  };

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    // Check if running inside an iframe (e.g. AI Studio preview)
    const isIframe = window.top && window.top !== window.self;
    if (isIframe) {
      setErrorMsg('Google OAuth cannot be completed inside the embedded AI Studio preview iframe due to Google security restrictions. Please open this application in a new tab (standalone URL) to sign in with Google.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const redirectTo = getAuthRedirectUrl();
      console.log('[Auth] Initiating Google OAuth with redirectTo:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) {
        console.error('Google OAuth error:', error);
        throw error;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to generate Google OAuth URL.');
      }
    } catch (err: any) {
      console.error('Google OAuth exception:', err);
      setErrorMsg(err.message || 'Google OAuth failed.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F17]/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-8 text-center space-y-3 border-b border-slate-800 bg-gradient-to-b from-slate-900/50 to-transparent">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto text-black shadow-lg shadow-emerald-500/20">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {mode === 'signup' 
              ? 'Create BioCode Account' 
              : mode === 'forgot' 
              ? 'Reset Password' 
              : 'Sign in to BioCode Studio'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'signup' 
              ? 'Enter your credentials to register a secure Supabase bioinformatics workspace.' 
              : mode === 'forgot' 
              ? 'Enter your registered email to receive a secure password reset link.' 
              : 'Access your secure genomic projects, analysis audit trails, and data.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {!isSupabaseConfigured && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Supabase Not Configured
              </div>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Please configure <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in your environment variables.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Alex Vance"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.vance@biocode.io"
                className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-300">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className="w-full mt-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'signup' 
                    ? 'Create Account' 
                    : mode === 'forgot' 
                    ? 'Send Reset Instructions' 
                    : 'Sign In'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {mode !== 'forgot' && (
            <>
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-4 text-slate-500 text-[10px] uppercase tracking-wider">or</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading || !isSupabaseConfigured}
                className="w-full py-2.5 rounded-xl bg-[#1F2937] hover:bg-[#374151] border border-slate-700 text-slate-200 font-medium text-xs transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.1 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.4 0 10.6 0 13s.6 4.6 1.6 6.6l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.3L1.6 15.9C3.5 19.7 7.4 23 12 23z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </>
          )}

          <div className="text-center pt-2 space-y-1">
            {mode === 'forgot' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-xs text-emerald-400 hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-xs text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
              >
                {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
