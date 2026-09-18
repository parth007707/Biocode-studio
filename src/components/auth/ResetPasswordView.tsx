import React, { useState, useEffect } from 'react';
import { Dna, Lock, AlertCircle, CheckCircle2, ArrowRight, Mail } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

export const ResetPasswordView: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'updated'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [requestNewEmail, setRequestNewEmail] = useState('');
  const [newEmailSent, setNewEmailSent] = useState(false);

  useEffect(() => {
    const checkRecoverySession = async () => {
      if (!isSupabaseConfigured) {
        setStatus('invalid');
        return;
      }

      try {
        // Check hash or URL params for errors or recovery tokens
        const hash = window.location.hash;
        const search = window.location.search;
        const fullUrl = hash + search;

        if (fullUrl.includes('error=') || fullUrl.includes('error_description=')) {
          setStatus('invalid');
          return;
        }

        // Check if session exists or if auth state change indicates recovery
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setStatus('valid');
          return;
        }

        // Listen for auth state change (PASSWORD_RECOVERY)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (event === 'PASSWORD_RECOVERY' || currentSession) {
            setStatus('valid');
          }
        });

        // Give it 3 seconds to resolve session from recovery link hash/tokens
        const timer = setTimeout(() => {
          subscription.unsubscribe();
          supabase.auth.getSession().then(({ data: { session: finalSession } }) => {
            if (finalSession) {
              setStatus('valid');
            } else {
              setStatus('invalid');
            }
          });
        }, 3000);

        return () => {
          clearTimeout(timer);
          subscription.unsubscribe();
        };
      } catch (err) {
        setStatus('invalid');
      }
    };

    checkRecoverySession();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setStatus('updated');
      setSuccessMsg('Password updated successfully! Redirecting to sign in...');
      setTimeout(() => {
        window.location.href = '/sign-in';
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestNewEmail) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(requestNewEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setNewEmailSent(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-4 text-slate-200">
        <div className="w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto text-black shadow-lg shadow-emerald-500/20">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Verifying Recovery Link</h2>
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto my-4" />
          <p className="text-xs text-slate-400">Please wait while we verify your password reset session...</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-4 text-slate-200">
        <div className="w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-red-500/10">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Invalid or Expired Link</h2>
          <p className="text-xs text-slate-300 leading-relaxed bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
            This password reset link is invalid or has expired. Please request a new reset link.
          </p>

          {newEmailSent ? (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>New reset instructions sent! Check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleRequestNewReset} className="space-y-3 pt-2 text-left">
              <label className="block text-xs font-medium text-slate-300">Enter your email for a new link:</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={requestNewEmail}
                  onChange={(e) => setRequestNewEmail(e.target.value)}
                  placeholder="alex.vance@biocode.io"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Request New Reset Link</span>
                )}
              </button>
            </form>
          )}

          <div className="pt-2">
            <a
              href="/sign-in"
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              Return to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-4 text-slate-200">
      <div className="w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 text-center space-y-3 border-b border-slate-800 bg-gradient-to-b from-slate-900/50 to-transparent">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto text-black shadow-lg shadow-emerald-500/20">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Set New Password</h2>
          <p className="text-xs text-slate-400">
            Enter and confirm your new secure password.
          </p>
        </div>

        <form onSubmit={handleUpdatePassword} className="p-8 space-y-4">
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

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">New Password</label>
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

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Confirm New Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || status === 'updated'}
            className="w-full mt-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Update Password</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
