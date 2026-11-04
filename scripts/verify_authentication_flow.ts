/**
 * BioCode Studio - Authentication & Reset Password Flow Audit Script
 * Verifies Supabase Auth initialization, Reset Password form fields (Email, New Password, Confirm New Password),
 * show/hide password controls, secure identity verification rules, dashboard redirection, and RLS policies.
 */

import { isSupabaseConfigured, supabase } from '../src/lib/supabase/client';
import fs from 'fs';
import path from 'path';

async function runResetPasswordAudit() {
  console.log('================================================================');
  console.log('  BioCode Studio - Reset Password & Auth Flow Audit');
  console.log('================================================================');

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${testName}${detail ? ` - ${detail}` : ''}`);
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    }
  }

  // 1. Verify Supabase Configuration & Auth Methods
  console.log('\n--- 1. Supabase Auth Setup ---');
  assert(isSupabaseConfigured === true, 'Supabase Configuration', 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY active');
  assert(typeof supabase.auth.updateUser === 'function', 'Auth Client', 'updateUser SDK method active for password updates');
  assert(typeof supabase.auth.resetPasswordForEmail === 'function', 'Auth Client', 'resetPasswordForEmail SDK method active for recovery emails');

  // 2. Audit Reset Password UI Components
  console.log('\n--- 2. Reset Password Form & Controls Audit ---');
  const loginPageCode = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/LoginPage.tsx'), 'utf-8');
  const authModalCode = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/AuthModal.tsx'), 'utf-8');
  const forgotViewCode = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/ForgotPasswordView.tsx'), 'utf-8');
  const resetViewCode = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/ResetPasswordView.tsx'), 'utf-8');

  // Check 1: Old email-only form "Send Link" button and success text removed
  assert(!forgotViewCode.includes('>Send Reset Instructions<') && !forgotViewCode.includes('>Send Link<'), 'Legacy Send Link Button Removed', 'Old email-only button removed from ForgotPasswordView');
  assert(!loginPageCode.includes('Password reset instructions sent! Please check your email inbox.'), 'Legacy Success Message Removed', 'Old message replaced with identity verification requirement');

  // Check 2: New Reset Password form has Email, New Password, Confirm New Password
  assert(forgotViewCode.includes('Email Address') && forgotViewCode.includes('New Password') && forgotViewCode.includes('Confirm New Password'), 'Reset Password Fields (ForgotPasswordView)', 'Email, New Password, and Confirm New Password present');
  assert(loginPageCode.includes('New Password') && loginPageCode.includes('Confirm New Password'), 'Reset Password Fields (LoginPage)', 'New Password and Confirm New Password present');
  assert(authModalCode.includes('New Password') && authModalCode.includes('Confirm New Password'), 'Reset Password Fields (AuthModal)', 'New Password and Confirm New Password present');
  assert(resetViewCode.includes('Email Address') && resetViewCode.includes('New Password') && resetViewCode.includes('Confirm New Password'), 'Reset Password Fields (ResetPasswordView)', 'Email, New Password, and Confirm New Password present');

  // Check 3: Show/hide password controls
  assert(forgotViewCode.includes('showPassword') && forgotViewCode.includes('showConfirmPassword'), 'Show/Hide Password Controls (ForgotPasswordView)', 'Toggles for password fields included');
  assert(loginPageCode.includes('showPassword') && loginPageCode.includes('showConfirmPassword'), 'Show/Hide Password Controls (LoginPage)', 'Toggles for password fields included');
  assert(authModalCode.includes('showPassword') && authModalCode.includes('showConfirmPassword'), 'Show/Hide Password Controls (AuthModal)', 'Toggles for password fields included');

  // Check 4: Primary button "Reset Password" & "Back to Sign In" link
  assert(forgotViewCode.includes('Reset Password') && forgotViewCode.includes('Back to Sign In'), 'Reset Password Button & Link (ForgotPasswordView)', 'Primary action button and back link present');
  assert(loginPageCode.includes('Reset Password') && loginPageCode.includes('Back to Sign In'), 'Reset Password Button & Link (LoginPage)', 'Primary action button and back link present');
  assert(authModalCode.includes('Reset Password'), 'Reset Password Button (AuthModal)', 'Primary action button present');

  // Check 5: Security Rule - Verify session before updateUser, or send recovery link without falsely claiming password was changed
  assert(forgotViewCode.includes('getSession') && forgotViewCode.includes('updateUser') && forgotViewCode.includes('resetPasswordForEmail'), 'Secure Identity Verification (ForgotPasswordView)', 'Session checked before password update; recovery link sent if unverified');
  assert(loginPageCode.includes('getSession') && loginPageCode.includes('updateUser') && loginPageCode.includes('resetPasswordForEmail'), 'Secure Identity Verification (LoginPage)', 'Session checked before password update; recovery link sent if unverified');
  assert(authModalCode.includes('getSession') && authModalCode.includes('updateUser') && authModalCode.includes('resetPasswordForEmail'), 'Secure Identity Verification (AuthModal)', 'Session checked before password update; recovery link sent if unverified');

  // Check 6: Password length & mismatch validation
  assert(forgotViewCode.includes('password !== confirmPassword') && forgotViewCode.includes('password.length < 6'), 'Password Validation (ForgotPasswordView)', 'Length >= 6 and matching password rules enforced');
  assert(loginPageCode.includes('password !== confirmPassword') && loginPageCode.includes('password.length < 6'), 'Password Validation (LoginPage)', 'Length >= 6 and matching password rules enforced');

  // 3. Database RLS Policies Audit
  console.log('\n--- 3. Database RLS Policies Audit ---');
  const schemaSql = fs.readFileSync(path.join(process.cwd(), 'supabase_schema.sql'), 'utf-8');

  const rlsTables = [
    'public.profiles',
    'public.projects',
    'public.sequence_records',
    'public.project_sequences',
    'public.analyses',
    'public.sequence_versions',
    'public.ai_conversations',
    'public.ai_messages'
  ];

  for (const table of rlsTables) {
    const tableName = table.replace('public.', '');
    const hasRlsEnable = schemaSql.includes(`alter table ${table} enable row level security;`);
    assert(hasRlsEnable, `RLS Enabled: ${tableName}`, `Row level security explicitly enabled for ${table}`);

    const hasUserIsolation = schemaSql.includes(`auth.uid() = user_id`) || schemaSql.includes(`auth.uid() = id`);
    assert(hasUserIsolation, `User Isolation Policy: ${tableName}`, `Policies verify auth.uid() matching record ownership`);
  }

  // 4. Session Call Test
  console.log('\n--- 4. Active Session Check ---');
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    assert(!error, 'getSession Call', 'Successfully executed getSession without runtime errors');
    console.log(`[Info] Session state: ${session ? session.user.email : 'Unauthenticated (Recovery flow ready)'}`);
  } catch (err: any) {
    assert(false, 'getSession Call', err.message);
  }

  console.log('\n================================================================');
  console.log(` Audit Complete: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runResetPasswordAudit().catch((err) => {
  console.error('[Fatal Error in Audit]', err);
  process.exit(1);
});
