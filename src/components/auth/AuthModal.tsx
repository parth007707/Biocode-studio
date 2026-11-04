import React, { useState } from 'react';
import { Dna, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, X, ShieldCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

interface AuthModalProps {
  onSuccess: () => void;
  onClose?: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  onClose,
  initialMode = 'signin'
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please verify environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (mode === 'signup') {
      if (!password || password.length < 6) {
        setErrorMsg('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (mode === 'signup') {
        const nameToUse = fullName.trim() || normalizedEmail.split('@')[0];
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: nameToUse
            }
          }
        });

        if (signUpError) throw signUpError;

        let activeSession = signUpData?.session;

        // If signUp succeeded but no session was returned, attempt immediate signInWithPassword
        if (!activeSession) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password
          });

          if (!signInError && signInData?.session) {
            activeSession = signInData.session;
          }
        }

        if (activeSession && activeSession.user) {
          try {
            await supabase.from('profiles').upsert(
              {
                id: activeSession.user.id,
                email: activeSession.user.email || normalizedEmail,
                full_name: nameToUse,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'id' }
            );
          } catch (profileErr) {
            console.warn('[AuthModal] Profile upsert notice:', profileErr);
          }

          setSuccessMsg('Account registered successfully! Redirecting...');
          setTimeout(onSuccess, 600);
        } else {
          setErrorMsg(
            'Registration succeeded, but an active session could not be established because Email Confirmation is required by your Supabase project settings. Please disable "Confirm email" in your Supabase Auth settings to enable immediate session creation.'
          );
        }
      } else if (mode === 'signin') {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });

        if (signInError) throw signInError;

        if (signInData?.session && signInData.session.user) {
          try {
            await supabase.from('profiles').upsert(
              {
                id: signInData.session.user.id,
                email: signInData.session.user.email || normalizedEmail,
                full_name: signInData.session.user.user_metadata?.full_name || normalizedEmail.split('@')[0],
                updated_at: new Date().toISOString()
              },
              { onConflict: 'id' }
            );
          } catch (profileErr) {
            console.warn('[AuthModal] Profile sync notice:', profileErr);
          }

          setSuccessMsg('Signed in successfully!');
          setTimeout(onSuccess, 600);
        } else {
          setErrorMsg('Sign in completed but no active session was returned. Please check your credentials.');
        }
      } else if (mode === 'forgot') {
        if (!password || password.length < 6) {
          setErrorMsg('New password must be at least 6 characters long.');
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match. Please verify both password entries.');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();

        if (session && session.user) {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;

          setSuccessMsg('Password updated successfully!');
          setTimeout(() => {
            setMode('signin');
            setPassword('');
            setConfirmPassword('');
            setSuccessMsg(null);
          }, 1200);
        } else {
          const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: `${window.location.origin}/reset-password`
          });

          if (error) throw error;

          setSuccessMsg(
            `Identity verification required. A secure password recovery link has been sent to ${normalizedEmail}. Please check your inbox and click the verification link to verify your identity and complete your password update.`
          );
        }
      }
    } catch (err: any) {
      console.error('[Auth Error]', err);
      const msg = err?.message || '';
      if (msg.includes('Invalid login credentials')) {
        setErrorMsg('Invalid email or password. Please verify your credentials or register a new account.');
      } else if (msg.includes('User already registered') || msg.includes('already exists')) {
        setErrorMsg('An account with this email address already exists. Please sign in instead.');
      } else {
        setErrorMsg(msg || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl overflow-hidden relative">
        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="p-6 text-center space-y-2 border-b border-[#E2E8F0] bg-gradient-to-b from-sky-50 to-white">
          <div className="w-10 h-10 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-center mx-auto text-[#0284C7] shadow-xs">
            <Dna className="w-5 h-5 animate-pulse" />
          </div>
          <h2 className="text-lg font-bold font-display text-[#0F172A] tracking-tight">
            {mode === 'signup'
              ? 'Create BioCode Account'
              : mode === 'forgot'
              ? 'Reset Password'
              : 'Sign in to BioCode Studio'}
          </h2>
          <p className="text-xs text-[#64748B]">
            {mode === 'signup'
              ? 'Register for cloud project persistence and mutation tracking.'
              : mode === 'forgot'
              ? 'Enter your email address and new password to reset your account password.'
              : 'Access your secure genomic projects, sequence data, and analysis history.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#334155]">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Alex Vance"
                  className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-9 pr-3 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[#334155]">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="researcher@biocode.io"
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-9 pr-3 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
              />
            </div>
          </div>

          {/* New Password Input (Sign In, Sign Up, and Reset Password Modes) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#334155]">
                {mode === 'forgot' ? 'New Password' : 'Password'}
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setErrorMsg(null); setSuccessMsg(null); }}
                  className="text-[11px] text-[#0284C7] hover:underline font-medium cursor-pointer"
                >
                  Forgot?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-9 pr-9 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] cursor-pointer p-0.5"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input (Sign Up & Reset Password Modes) */}
          {(mode === 'signup' || mode === 'forgot') && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#334155]">
                {mode === 'forgot' ? 'Confirm New Password' : 'Confirm Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-9 pr-9 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] cursor-pointer p-0.5"
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'signup' ? 'Register Account' : mode === 'forgot' ? 'Reset Password' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="text-center pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-[#0284C7] hover:underline cursor-pointer font-medium"
            >
              {mode === 'signup' ? 'Already have an account? Sign in' : mode === 'forgot' ? 'Back to Sign In' : "Don't have an account? Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
