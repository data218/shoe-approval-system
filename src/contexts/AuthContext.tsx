import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
        
        // Wait and retry first, as the signup process might still be inserting the profile (race condition)
        if (retries > 0) {
          setTimeout(() => fetchProfile(userId, retries - 1), 1000);
          return;
        }

        // If we ran out of retries, it means the profile genuinely failed to create during signup.
        // Let's self-heal by creating a default profile for them.
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
           setTimeout(() => fetchProfile(userId, 0), 500);
           return;
        } else {
           // Self-healing failed. Show EXACTLY why so we can fix it.
           console.error('Self-healing insert failed:', insertError);
           setAuthError(`Self-Healing Failed! Database rejected the insert: ${insertError.message || insertError.details || JSON.stringify(insertError)}`);
           setLoading(false);
           return;
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
            <h3 className="font-bold text-lg mb-2">Your employee profile needs attention</h3>
            <p className="mb-4">We could not load your employee profile. Please sign out and contact your administrator to check your account.</p>
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
