import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, createPasswordVerificationClient } from '../lib/supabase';
import { getRoleLabel } from '../lib/approvals';
import { changeOwnPassword } from '../lib/passwordRecovery';

export default function MyAccount() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', password: '', confirmation: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setSaving(true);
    const verification = createPasswordVerificationClient();
    try {
      await changeOwnPassword({
        getUser: () => supabase.auth.getUser(),
        signInWithPassword: (credentials) => verification.auth.signInWithPassword(credentials),
        updateUser: (attributes) => supabase.auth.updateUser(attributes),
      }, session?.user.id, profile, form.current, form.password, form.confirmation);
      setCompleted(true); setForm({ current: '', password: '', confirmation: '' });
      await signOut();
      navigate('/login', { replace: true, state: { message: 'Password changed successfully. Sign in with your new password.' } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to change your password. Please try again.');
    } finally {
      void verification.auth.signOut({ scope: 'local' });
      setSaving(false);
    }
  };
  if (completed) return <p role="status" className="p-8 text-center">Password changed. Returning to sign in…</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div><h1 className="text-3xl font-bold text-slate-900">My Account</h1><p className="mt-2 text-slate-600">Manage your own sign-in password.</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="font-bold text-slate-900">{profile?.full_name}</p>
        <p className="mt-1 break-all text-sm text-slate-500">{session?.user.email}</p>
        <span className="mt-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{getRoleLabel(profile?.role)}</span>
      </div>
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-6"><KeyRound className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-slate-900">Change Password</h2></div>
        <div className="space-y-5 p-6">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {([
            ['current', 'Current Password', 'current-password'],
            ['password', 'New Password', 'new-password'],
            ['confirmation', 'Confirm New Password', 'new-password'],
          ] as const).map(([field, label, autocomplete]) => <div key={field}>
            <label htmlFor={`account-${field}`} className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
            <input id={`account-${field}`} type={show ? 'text' : 'password'} autoComplete={autocomplete} required
              minLength={field === 'current' ? undefined : 6} value={form[field]} disabled={saving}
              onChange={(event) => setForm({ ...form, [field]: event.target.value })}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50" />
          </div>)}
          <p className="text-xs text-slate-500">Use at least 6 characters with a letter, a number and a special character. Your current password is verified before making the change.</p>
          <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-2 text-sm text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide passwords' : 'Show passwords'}</button>
        </div>
        <div className="flex justify-end border-t border-slate-100 p-6"><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{saving && <RefreshCw className="h-4 w-4 animate-spin" />}{saving ? 'Updating…' : 'Change Password'}</button></div>
      </form>
    </div>
  );
}
