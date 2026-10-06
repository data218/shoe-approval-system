import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Key, Mail, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Since we are mocking user signups, we can add a toggle to sign up a mock user quickly for testing
  const [isSignUp, setIsSignUp] = useState(false);
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'REQUESTER' | 'NARENDRA' | 'SANJEEV' | 'ADMIN'>('REQUESTER');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        
        if (data.user) {
          // Create profile
          const { error: profileError } = await supabase.from('profiles').insert([
            {
              id: data.user.id,
              full_name: fullName,
              employee_code: employeeCode,
              role: role,
              department: 'Sales',
              showroom_location: 'Main Branch'
            }
          ]);
          
          if (profileError) {
             console.error('Profile creation failed:', profileError);
             throw new Error('User created but profile setup failed. Check RLS or schema.');
          }
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
            <Key className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          Shoe Showroom Approval System
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isSignUp ? 'Create a new account' : 'Sign in to your account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleAuth}>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Email address</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-slate-500 focus:border-slate-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2 border"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-slate-500 focus:border-slate-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2 border"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {isSignUp && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 focus:ring-slate-500 focus:border-slate-500 block w-full sm:text-sm border-slate-300 rounded-lg py-2 px-3 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className="mt-1 focus:ring-slate-500 focus:border-slate-500 block w-full sm:text-sm border-slate-300 rounded-lg py-2 px-3 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm rounded-lg border"
                  >
                    <option value="REQUESTER">Requester (Employee)</option>
                    <option value="NARENDRA">Narendra (Level 1)</option>
                    <option value="SANJEEV">Sanjeev (Level 2)</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Testing?</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full flex justify-center py-2.5 px-4 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors"
              >
                {isSignUp ? 'Sign in instead' : 'Create test account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
