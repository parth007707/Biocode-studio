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
    <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-4 text-slate-200">
      <div className="w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto text-black shadow-lg shadow-emerald-500/20">
          <Dna className="w-6 h-6 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">BioCode Studio Authentication</h2>
        
        {status === 'loading' && (
          <div className="space-y-3 py-4">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Verifying secure session and establishing workspace connection...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3 py-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-xs text-emerald-300">Authentication successful! Redirecting to workspace...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <a
              href="/"
              className="inline-block w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all text-center"
            >
              Return to Sign In
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
