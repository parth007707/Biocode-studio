import React, { useState } from 'react';
import { Dna, Mail, KeyRound, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, X, ShieldCheck } from 'lucide-react';
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
  // OTP flow steps for mode === 'forgot': 'email' -> 'otp' -> 'password'
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'password'>('email');
  const [email, setEmail] = useState<string>('');
  const [otpToken, setOtpToken] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetState = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPassword('');
    setConfirmPassword('');
    setOtpToken('');
    setForgotStep('email');
  };

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
        // Step 1: Send OTP
        if (forgotStep === 'email') {
          const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
          if (error) throw error;

          setForgotStep('otp');
          setSuccessMsg(`Verification code sent to ${normalizedEmail}. Please enter the 6-digit code below.`);
        } 
        // Step 2: Verify OTP
        else if (forgotStep === 'otp') {
          const token = otpToken.trim();
          if (!token || token.length < 6) {
            setErrorMsg('Please enter the 6-digit verification code.');
            return;
          }

          const { data, error } = await supabase.auth.verifyOtp({
            email: normalizedEmail,
            token,
            type: 'recovery',
          });

          if (error) throw error;

          if (data?.session) {
            setForgotStep('password');
            setSuccessMsg('Code verified successfully. Please enter your new password.');
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              setForgotStep('password');
              setSuccessMsg('Code verified successfully. Please enter your new password.');
            } else {
              setErrorMsg('Invalid or expired verification code. Please request a new code.');
            }
          }
        } 
        // Step 3: Change Password
        else if (forgotStep === 'password') {
          if (!password || password.length < 6) {
            setErrorMsg('New password must be at least 6 characters long.');
            return;
          }
          if (password !== confirmPassword) {
            setErrorMsg('Passwords do not match.');
            return;
          }

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('Recovery session expired. Please restart the password recovery process.');
          }

          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;

          setSuccessMsg('Password changed successfully! Redirecting to Sign In...');
          setTimeout(() => {
            setMode('signin');
            resetState();
          }, 1500);
        }
      }
    } catch (err: any) {
      console.error('[Auth Error]', err);
      const msg = err?.message || '';
      if (msg.includes('Invalid login credentials')) {
        setErrorMsg('Invalid email or password. Please verify your credentials or register a new account.');
      } else if (msg.includes('User already registered') || msg.includes('already exists')) {
        setErrorMsg('An account with this email address already exists. Please sign in instead.');
      } else if (msg.includes('expired') || msg.includes('invalid') || msg.includes('Token')) {
        setErrorMsg('Invalid or expired verification code. Please check your code or request a new one.');
      } else if (msg.includes('rate limit')) {
        setErrorMsg('Too many recovery attempts. Please wait a few minutes before trying again.');
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
            {mode === 'signup' && 'Create BioCode Account'}
            {mode === 'signin' && 'Sign in to BioCode Studio'}
            {mode === 'forgot' && (
              forgotStep === 'email' ? 'Forgot Password' :
              forgotStep === 'otp' ? 'Verify Security Code' :
              'Change Password'
            )}
          </h2>
          <p className="text-xs text-[#64748B]">
            {mode === 'signup' && 'Register for cloud project persistence and mutation tracking.'}
            {mode === 'signin' && 'Access your secure genomic projects, sequence data, and analysis history.'}
            {mode === 'forgot' && (
              forgotStep === 'email' ? 'Enter your registered email address to receive a secure verification code.' :
              forgotStep === 'otp' ? `Enter the 6-digit code sent to ${email}` :
              'Enter your new password below to secure your account.'
            )}
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

          {/* Email input (Visible in signin, signup, or forgot step 'email') */}
          {(mode !== 'forgot' || forgotStep === 'email') && (
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
          )}

          {/* OTP input (Visible in forgot step 'otp') */}
          {mode === 'forgot' && forgotStep === 'otp' && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#334155]">6-Digit Security Code (OTP)</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={otpToken}
                  onChange={(e) => setOtpToken(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-9 pr-3 py-2 text-sm tracking-widest text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono text-center"
                />
              </div>
            </div>
          )}

          {/* Password Input (Sign In, Sign Up, or forgot step 'password') */}
          {(mode !== 'forgot' || forgotStep === 'password') && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#334155]">
                  {mode === 'forgot' ? 'New Password' : 'Password'}
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); resetState(); }}
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
          )}

          {/* Confirm Password Input (Sign Up or forgot step 'password') */}
          {(mode === 'signup' || (mode === 'forgot' && forgotStep === 'password')) && (
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
                <span>
                  {mode === 'signup' && 'Register Account'}
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'forgot' && (
                    forgotStep === 'email' ? 'Send Verification Code' :
                    forgotStep === 'otp' ? 'Verify Code' :
                    'Change Password'
                  )}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="text-center pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup');
                resetState();
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
