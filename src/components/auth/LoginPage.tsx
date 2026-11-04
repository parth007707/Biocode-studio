import React, { useState } from 'react';
import { Dna, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

interface LoginPageProps {
  onSuccess?: () => void;
  onContinueAsGuest?: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSuccess,
  onContinueAsGuest,
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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase credentials are missing. Please verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment configuration.');
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
        setErrorMsg('Passwords do not match. Please verify both password entries.');
        return;
      }
    } else if (mode === 'signin') {
      if (!password) {
        setErrorMsg('Please enter your password.');
        return;
      }
    }

    setLoading(true);

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

        // If signUp succeeded but no session was returned (e.g. Email Confirmation enabled in Supabase),
        // attempt immediate signInWithPassword to obtain an active session
        if (!activeSession) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password
          });

          if (!signInError && signInData?.session) {
            activeSession = signInData.session;
          }
        }

        // Verify active session exists
        if (activeSession && activeSession.user) {
          // Create or update user profile without duplicates
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
            console.warn('[LoginPage] Profile upsert notice:', profileErr);
          }

          setSuccessMsg('Account registered successfully! Loading research workspace...');
          setTimeout(() => {
            if (onSuccess) onSuccess();
          }, 600);
        } else {
          setErrorMsg(
            'Registration succeeded, but an active session could not be established because Email Confirmation is enabled in your Supabase project settings. To support immediate registration and session creation, please disable "Confirm email" under Supabase Dashboard -> Auth Settings.'
          );
        }
      } else if (mode === 'signin') {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });

        if (signInError) throw signInError;

        if (signInData?.session && signInData.session.user) {
          // Sync profile on sign in
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
            console.warn('[LoginPage] Profile sync notice:', profileErr);
          }

          setSuccessMsg('Signed in successfully! Loading research workspace...');
          setTimeout(() => {
            if (onSuccess) onSuccess();
          }, 600);
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

        // Check if a verified recovery session is present
        const { data: { session } } = await supabase.auth.getSession();

        if (session && session.user) {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;

          setSuccessMsg('Password updated successfully! Redirecting to sign in...');
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
      console.error('[Auth Exception]', err);
      const rawMsg = err?.message || String(err);

      if (rawMsg.includes('Invalid login credentials')) {
        setErrorMsg('Invalid email or password. Please verify your credentials or click "Register" below.');
      } else if (rawMsg.includes('User already registered') || rawMsg.includes('already exists')) {
        setErrorMsg('An account with this email address already exists. Please sign in instead.');
      } else if (rawMsg.includes('Password should be at least')) {
        setErrorMsg('Password must be at least 6 characters long.');
      } else if (rawMsg.includes('Email rate limit exceeded')) {
        setErrorMsg('Too many authentication requests. Please wait a few minutes before trying again.');
      } else {
        setErrorMsg(rawMsg || 'Authentication request failed. Please check your network and credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 text-[#0F172A] font-sans relative overflow-hidden">
      {/* Background Decorative Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-sky-100/60 via-sky-50/20 to-transparent pointer-events-none -z-10" />
      <div className="absolute -top-24 right-10 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-24 -left-10 w-96 h-96 bg-indigo-100/30 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-xl overflow-hidden z-10 transition-all">
        {/* Branding & Header */}
        <div className="p-6 sm:p-8 text-center space-y-3 border-b border-[#E2E8F0] bg-gradient-to-b from-sky-50/50 to-white">
          <div className="w-12 h-12 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center mx-auto text-[#0284C7] shadow-sm">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-[#0F172A] tracking-tight">
              {mode === 'signup'
                ? 'Create BioCode Account'
                : mode === 'forgot'
                ? 'Reset Password'
                : 'Sign in to BioCode Studio'}
            </h1>
            <p className="text-xs text-[#64748B] mt-1 font-sans">
              {mode === 'signup'
                ? 'Register for cloud sequence persistence and workspace collaboration.'
                : mode === 'forgot'
                ? 'Enter your email address and new password to reset your account password.'
                : 'Access your genomic analyses, mutation records, and 3D structure data.'}
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex items-center justify-center gap-1 bg-[#F1F5F9] p-1 rounded-xl text-xs font-mono border border-[#E2E8F0] mt-3">
            <button
              type="button"
              onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex-1 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
                mode === 'signin' ? 'bg-white text-[#0284C7] shadow-xs border border-[#CBD5E1]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex-1 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
                mode === 'signup' ? 'bg-white text-[#0284C7] shadow-xs border border-[#CBD5E1]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex-1 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
                mode === 'forgot' ? 'bg-white text-[#0284C7] shadow-xs border border-[#CBD5E1]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleAuthSubmit} className="p-6 sm:p-8 space-y-4">
          {/* Status Notifications */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5 shadow-2xs font-sans">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 shadow-2xs font-sans">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          {/* Full Name Input (Sign Up Mode) */}
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#334155]">Full Name / Researcher Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Alex Vance"
                  className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-sans shadow-2xs"
                />
              </div>
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#334155]">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="researcher@biocode.io"
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-mono shadow-2xs"
              />
            </div>
          </div>

          {/* Password Input (Sign In, Sign Up, and Reset Password Modes) */}
          <div className="space-y-1.5">
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
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-mono shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] transition-colors cursor-pointer p-1"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input (Sign Up & Reset Password Modes) */}
          {(mode === 'signup' || mode === 'forgot') && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#334155]">
                {mode === 'forgot' ? 'Confirm New Password' : 'Confirm Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-mono shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] transition-colors cursor-pointer p-1"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 sm:py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'signup'
                    ? 'Create Research Account'
                    : mode === 'forgot'
                    ? 'Reset Password'
                    : 'Sign In to Studio'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Back to Sign In button in Reset Password mode */}
          {mode === 'forgot' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
                className="text-xs text-[#0284C7] hover:underline font-semibold cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          )}

          {/* Guest Sandbox Fallback Option */}
          {onContinueAsGuest && (
            <div className="pt-2 text-center border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-xs text-[#64748B] hover:text-[#0284C7] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Explore in Sandbox / Guest Mode</span>
              </button>
            </div>
          )}
        </form>

        {/* Card Footer Security Badge */}
        <div className="px-6 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex items-center justify-between font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Supabase Auth & RLS Protected</span>
          </span>
          <span>SSL Encrypted</span>
        </div>
      </div>
    </div>
  );
};
