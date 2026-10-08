import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  full_name: string;
  employee_code: string;
  role: 'ADMIN' | 'REQUESTER' | 'L1_APPROVER' | 'L2_APPROVER';
  department: string;
  showroom_location: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/update-password';
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, retries = 3) => {
    const { data, error } = await supabase
      .from('shoe_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // PGRST116 means 0 rows returned. Profile is missing!
        // Let's self-heal by creating a default profile for them.
        if (retries > 0) {
          const { error: insertError } = await supabase.from('shoe_profiles').insert({
            id: userId,
            full_name: 'Missing Profile',
            employee_code: `FIX-${Math.floor(Math.random() * 10000)}`,
            role: 'REQUESTER',
            department: 'System Fixed',
            showroom_location: 'System Fixed'
          });
          
          if (!insertError) {
             // Successfully self-healed, fetch again
             setTimeout(() => fetchProfile(userId, retries - 1), 500);
             return;
          } else {
             // Self-healing failed. Show EXACTLY why so we can fix it.
             console.error('Self-healing insert failed:', insertError);
             setAuthError(`Self-Healing Failed! Database rejected the insert: ${insertError.message || insertError.details || JSON.stringify(insertError)}`);
             setLoading(false);
             return;
          }
        }
      }
      console.error('Error fetching profile:', error);
      setAuthError(`Database Error: ${error.message || error.details || JSON.stringify(error)}`);
    } else if (data) {
      setProfile(data as Profile);
      setAuthError(null);
    }
    setLoading(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, signOut, loading }}>
      {authError && !window.location.pathname.includes('/update-password') ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-xl max-w-lg shadow-sm">
            <h3 className="font-bold text-lg mb-2">Critical Database Error</h3>
            <p className="mb-4">The app successfully logged you in, but the database blocked us from reading your profile. This is almost certainly because the Row Level Security (RLS) SQL command was not run.</p>
            <div className="bg-white p-3 rounded border border-red-100 font-mono text-sm mb-4">
              {authError}
            </div>
            <p className="text-sm font-semibold">Please run this in your Supabase SQL Editor:</p>
            <pre className="bg-slate-900 text-slate-50 p-4 rounded mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
              {`-- 1. Fix role constraints
ALTER TABLE shoe_profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE shoe_profiles DROP CONSTRAINT IF EXISTS shoe_profiles_role_check;
ALTER TABLE shoe_profiles ADD CONSTRAINT shoe_profiles_role_check CHECK (role IN ('ADMIN', 'REQUESTER', 'L1_APPROVER', 'L2_APPROVER', 'NARENDRA', 'SANJEEV'));

-- 2. Fix RLS policies
DROP POLICY IF EXISTS "Allow public read profiles" ON shoe_profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON shoe_profiles;
DROP POLICY IF EXISTS "Allow users to insert own profile" ON shoe_profiles;

ALTER TABLE shoe_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read profiles" ON shoe_profiles FOR SELECT USING (true);
CREATE POLICY "Allow users to update own profile" ON shoe_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow users to insert own profile" ON shoe_profiles FOR INSERT WITH CHECK (auth.uid() = id);`}
            </pre>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => supabase.auth.signOut()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
              >
                Sign Out & Start Over
              </button>
            </div>
          </div>
        </div>
      ) : (
        !loading && children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
