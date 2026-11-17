import React, { useState } from 'react';
import { Dna, Mail, KeyRound, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

export const ForgotPasswordView: React.FC = () => {
  // 3-step clean recovery state: 'email' -> 'otp' -> 'password' -> 'success'
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Step 1: Send OTP to email via Supabase recovery flow
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      // Send secure one-time verification code (OTP) via Supabase recovery
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
      if (error) throw error;

      setStep('otp');
      setSuccessMsg(`Verification code sent to ${normalizedEmail}. Please enter the 6-digit code below.`);
    } catch (err: any) {
      console.error('[Recovery Error] resetPasswordForEmail failed:', err);
      const msg = err?.message || String(err);
      if (msg.includes('rate limit')) {
        setErrorMsg('Too many recovery attempts. Please wait a few minutes before trying again.');
      } else {
        setErrorMsg(msg || 'Failed to send verification code. Please check your email address.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the OTP token securely
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const token = otpToken.trim();
    if (!token || token.length < 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'recovery',
      });

      if (error) throw error;

      if (data?.session) {
        setStep('password');
        setSuccessMsg('Code verified successfully. Please enter your new password.');
      } else {
        // Double check session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setStep('password');
          setSuccessMsg('Code verified successfully. Please enter your new password.');
        } else {
          setErrorMsg('Invalid or expired verification code. Please request a new code.');
        }
      }
    } catch (err: any) {
      console.error('[Recovery Error] verifyOtp failed:', err);
      const msg = err?.message || String(err);
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('Token')) {
        setErrorMsg('Invalid or expired verification code. Please check your code or request a new one.');
      } else {
        setErrorMsg(msg || 'Failed to verify code.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify both entries.');
      return;
    }

    setLoading(true);

    try {
      // Must be authenticated via verified session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Recovery session expired. Please restart the password recovery process.');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setSuccessMsg('Password changed successfully! Redirecting to Sign In...');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err: any) {
      console.error('[Recovery Error] updateUser password failed:', err);
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 text-[#0F172A] font-sans relative overflow-hidden">
      {/* Background Decorative Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-sky-100/60 via-sky-50/20 to-transparent pointer-events-none -z-10" />
      <div className="absolute -top-24 right-10 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-xl overflow-hidden z-10">
        {/* Header */}
        <div className="p-6 sm:p-8 text-center space-y-3 border-b border-[#E2E8F0] bg-gradient-to-b from-sky-50/50 to-white">
          <div className="w-12 h-12 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center mx-auto text-[#0284C7] shadow-sm">
            <Dna className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-[#0F172A] tracking-tight">
              {step === 'email' && 'Forgot Password'}
              {step === 'otp' && 'Verify Security Code'}
              {step === 'password' && 'Change Password'}
            </h1>
            <p className="text-xs text-[#64748B] mt-1 font-sans">
              {step === 'email' && 'Enter your registered email address to receive a secure verification code.'}
              {step === 'otp' && `Enter the 6-digit code sent to ${email}`}
              {step === 'password' && 'Enter your new password below to secure your account.'}
            </p>
          </div>
        </div>

        {/* Notifications */}
        <div className="px-6 sm:px-8 pt-4">
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
        </div>

        {/* STEP 1: Email Form */}
        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="p-6 sm:p-8 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#334155]">Registered Email Address</label>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 sm:py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2 border-t border-[#E2E8F0]">
              <a
                href="/login"
                className="text-xs text-[#0284C7] hover:underline font-semibold cursor-pointer"
              >
                Back to Sign In
              </a>
            </div>
          </form>
        )}

        {/* STEP 2: OTP Verification Form */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="p-6 sm:p-8 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#334155]">6-Digit Security Code (OTP)</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={otpToken}
                  onChange={(e) => setOtpToken(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-sm tracking-widest text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 font-mono shadow-2xs text-center"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 sm:py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Verify Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0] text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                Change Email / Resend
              </button>
              <a
                href="/login"
                className="text-[#0284C7] hover:underline font-semibold cursor-pointer"
              >
                Back to Sign In
              </a>
            </div>
          </form>
        )}

        {/* STEP 3: Change Password Form */}
        {step === 'password' && (
          <form onSubmit={handleChangePassword} className="p-6 sm:p-8 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#334155]">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 sm:py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
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

            <div className="text-center pt-2 border-t border-[#E2E8F0]">
              <a
                href="/login"
                className="text-xs text-[#0284C7] hover:underline font-semibold cursor-pointer"
              >
                Back to Sign In
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
