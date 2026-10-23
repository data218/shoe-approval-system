import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isListedUser } from '../lib/access';

interface Profile {
  id: string;
  full_name: string;
  employee_code: string;
  role: 'ADMIN' | 'REQUESTER' | 'NARENDRA' | 'SANJEEV';
  department: string;
  showroom_location: string;
}
interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  loading: boolean;
  accessError: string | null;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let candidate: Session | null = null;
    let version = 0;
    let eventVersion = 0;
    let recoveryPending = false;
    const clear = () => { setSession(null); setUser(null); setProfile(null); };
    const verify = async (next: Session | null) => {
      const current = ++version;
      candidate = next;
      if (!next) {
        if (active) { clear(); setLoading(false); }
        return;
      }
      try {
        const { data, error } = await supabase.from('shoe_profiles').select('*').eq('id', next.user.id).maybeSingle();
        if (!active || current !== version) return;
        if (error || !isListedUser(next.user.id, data)) {
          clear();
          setAccessError(error ? 'Unable to verify your access. Please try signing in again.' : 'Access denied. Only users added by an administrator can sign in.');
          setLoading(false);
          candidate = null;
          // No automatic profile creation. Unlisted Auth accounts stay unlisted.
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }
        setSession(next); setUser(next.user); setProfile(data as Profile);
        setAccessError(null); setLoading(false);
        if (recoveryPending) {
          recoveryPending = false;
          if (window.location.pathname !== '/update-password') {
            window.history.replaceState(window.history.state, '', '/update-password');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }
      } catch {
        if (!active || current !== version) return;
        clear(); setLoading(false);
        setAccessError('Unable to verify your access. Please try signing in again.');
      }
    };
    // Defer network/auth calls until the Supabase auth event callback releases its lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      eventVersion++;
      if (event === 'PASSWORD_RECOVERY') recoveryPending = true;
      if (!next) {
        candidate = null; version++;
        clear(); setLoading(false);
      } else {
        window.setTimeout(() => { if (active) void verify(next); }, 0);
      }
    });
    const initialEventVersion = eventVersion;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || eventVersion !== initialEventVersion) return;
      if (error) { setAccessError('Unable to load your session. Please sign in again.'); setLoading(false); }
      else void verify(data.session);
    }).catch(() => { if (active) { setAccessError('Unable to load your session. Please sign in again.'); setLoading(false); } });
    const refresh = () => { if (candidate && document.visibilityState !== 'hidden') void verify(candidate); };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false; version++;
      subscription.unsubscribe(); window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const signOut = async () => {
    setSession(null); setUser(null); setProfile(null); setAccessError(null);
    await supabase.auth.signOut({ scope: 'local' });
  };
  return (
    <AuthContext.Provider value={{ session, user, profile, signOut, loading, accessError }}>
      {loading ? <div role="status" className="flex min-h-screen items-center justify-center text-slate-600">Checking access…</div> : children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
