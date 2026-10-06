import React, { useState } from 'react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, AlertCircle } from 'lucide-react';

export default function CompleteProfile() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [role, setRole] = useState<'REQUESTER' | 'NARENDRA' | 'SANJEEV' | 'ADMIN'>('REQUESTER');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user) return;

    setLoading(true);
    setError(null);

    try {
      const { error: profileError } = await supabase.from('shoe_profiles').insert([
        {
          id: session.user.id,
          full_name: fullName,
          employee_code: employeeCode,
          role: role,
          department: 'Sales',
          showroom_location: 'Main Branch'
        }
      ]);

      if (profileError) {
        if (profileError.code === '23505' && profileError.message.includes('employee_code')) {
          throw new Error('This Employee Code is already in use by another account. Please use your unique code.');
        }
        throw profileError;
      }

      // Force a reload to fetch the new profile context
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Failed to complete profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
            <User className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          Complete Your Profile
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Please fill in your employee details to continue.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

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

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : 'Complete Setup'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
