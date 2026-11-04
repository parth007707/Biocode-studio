import React, { useEffect, useState } from 'react';
import { Dna, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

export const AuthCallbackView: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      if (!isSupabaseConfigured) {
        setStatus('error');
        setErrorMessage('Supabase is not configured.');
        return;
      }

      try {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        
        const errorDesc = params.get('error_description') || hashParams.get('error_description') || params.get('error') || hashParams.get('error');
        if (errorDesc) {
          setStatus('error');
          setErrorMessage(decodeURIComponent(errorDesc));
          return;
        }

        const next = params.get('next') || hashParams.get('next') || '/dashboard';

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session) {
          setStatus('success');
          if (window.opener) {
            window.opener.postMessage({ type: 'SUPABASE_AUTH_SUCCESS' }, window.location.origin);
            setTimeout(() => {
              window.close();
            }, 800);
          } else {
            setTimeout(() => {
              window.location.href = next;
            }, 1000);
          }
        } else {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            if (currentSession) {
              setStatus('success');
              if (window.opener) {
                window.opener.postMessage({ type: 'SUPABASE_AUTH_SUCCESS' }, window.location.origin);
                setTimeout(() => {
                  window.close();
                }, 800);
              } else {
                setTimeout(() => {
                  window.location.href = next;
                }, 1000);
              }
            }
          });

          setTimeout(() => {
            subscription.unsubscribe();
            supabase.auth.getSession().then(({ data: { session: finalSession } }) => {
              if (finalSession) {
                if (window.opener) {
                  window.opener.postMessage({ type: 'SUPABASE_AUTH_SUCCESS' }, window.location.origin);
                  setTimeout(() => {
                    window.close();
                  }, 800);
                } else {
                  window.location.href = next;
                }
              } else {
                setStatus('error');
                setErrorMessage('Authentication session could not be established. Please sign in again.');
              }
            });
          }, 4000);
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Authentication callback failed.');
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 text-[#0F172A] font-sans">
      <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl p-8 text-center space-y-4 shadow-xl">
        <div className="w-12 h-12 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center mx-auto text-[#0284C7] shadow-xs">
          <Dna className="w-6 h-6 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold font-display text-[#0F172A] tracking-tight">BioCode Studio Authentication</h2>
        
        {status === 'loading' && (
          <div className="space-y-3 py-4">
            <Loader2 className="w-8 h-8 text-[#0284C7] animate-spin mx-auto" />
            <p className="text-xs text-[#64748B]">Verifying secure session and establishing workspace connection...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3 py-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-xs text-emerald-800 font-medium">Authentication successful! Redirecting to workspace...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
            <a
              href="/login"
              className="inline-block w-full py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all text-center cursor-pointer shadow-xs"
            >
              Return to Sign In
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
