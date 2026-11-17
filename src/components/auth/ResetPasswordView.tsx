import React, { useState, useEffect } from 'react';
import { Dna, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

export const ResetPasswordView: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'updated'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const checkRecoverySession = async () => {
      if (!isSupabaseConfigured) {
        setStatus('invalid');
        return;
      }

      try {
        const hash = window.location.hash;
        const search = window.location.search;
        const fullUrl = hash + search;

        if (fullUrl.includes('error=') || fullUrl.includes('error_description=')) {
          setStatus('invalid');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setStatus('valid');
          return;
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (event === 'PASSWORD_RECOVERY' || currentSession) {
            setStatus('valid');
          }
        });

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
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify both password entries.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Recovery session has expired or is invalid. Please request a new recovery link.');
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setStatus('updated');
      setSuccessMsg('Password changed successfully! Redirecting to Sign In...');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err: any) {
      console.error('[Update Password Error]', err);
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 text-[#0F172A]">
        <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center mx-auto text-[#0284C7] shadow-xs">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold font-display text-[#0F172A] tracking-tight">Verifying Recovery Session</h2>
          <div className="w-6 h-6 border-2 border-[#0284C7] border-t-transparent rounded-full animate-spin mx-auto my-4" />
          <p className="text-xs text-[#64748B]">Please wait while we verify your secure recovery authorization...</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 text-[#0F172A]">
        <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold font-display text-[#0F172A] tracking-tight">Invalid or Expired Link</h2>
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3.5 rounded-xl leading-relaxed">
            This password recovery session is invalid or has expired. Please restart the password recovery process.
          </p>
          <div className="pt-2 border-t border-[#E2E8F0]">
            <a
              href="/login"
              className="inline-block w-full py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs text-center cursor-pointer"
            >
              Return to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 text-[#0F172A]">
      <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-xl overflow-hidden">
        <div className="p-8 text-center space-y-3 border-b border-[#E2E8F0] bg-gradient-to-b from-sky-50 to-white">
          <div className="w-12 h-12 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center mx-auto text-[#0284C7] shadow-xs">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold font-display text-[#0F172A] tracking-tight">Change Password</h2>
          <p className="text-xs text-[#64748B]">
            Enter your new password below to secure your account.
          </p>
        </div>

        <form onSubmit={handleUpdatePassword} className="p-8 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#334155]">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] cursor-pointer p-0.5"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#334155]">Confirm New Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] cursor-pointer p-0.5"
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || status === 'updated'}
            className="w-full mt-2 py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Change Password</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Back to Sign In */}
          <div className="text-center pt-2 border-t border-[#E2E8F0]">
            <a
              href="/login"
              className="text-xs text-[#0284C7] hover:underline font-semibold cursor-pointer"
            >
              Back to Sign In
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};
