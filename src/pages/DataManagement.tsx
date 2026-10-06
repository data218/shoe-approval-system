import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default function DataManagement() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState<'requests' | 'items' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extra security check: only admins can view this page
  if (profile?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleClearRequests = async () => {
    if (!window.confirm("Are you sure you want to permanently delete ALL approval requests and their history from the system? This action cannot be undone.")) {
      return;
    }

    try {
      setLoading('requests');
      setError(null);
      setSuccess(null);

      // Deleting from shoe_requests will cascade and delete from purchase_details, discount_details, audit_logs, and notifications
      const { error: deleteError } = await supabase
        .from('shoe_requests')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Dummy condition to delete all

      if (deleteError) throw deleteError;

      setSuccess('All approval requests, logs, and associated details have been permanently deleted.');
    } catch (err: any) {
      console.error(err);
      setError('Failed to clear requests: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(null);
    }
  };

  const handleClearItems = async () => {
    if (!window.confirm("Are you sure you want to permanently delete ALL master items from the database? This action cannot be undone.")) {
      return;
    }

    try {
      setLoading('items');
      setError(null);
      setSuccess(null);

      const { error: deleteError } = await supabase
        .from('shoe_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) throw deleteError;

      setSuccess('All master items have been permanently deleted.');
    } catch (err: any) {
      console.error(err);
      setError('Failed to clear items: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Database className="w-8 h-8 text-brand-600" />
            Data Management
          </h1>
          <p className="text-slate-500 mt-2 font-medium">
            Permanently wipe testing data to prepare the system for production.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-emerald-700 font-medium">{success}</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden p-6 relative">
          <div className="absolute top-0 left-0 w-2 h-full bg-rose-500"></div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pl-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Clear Approval Requests</h3>
              <p className="text-slate-500 text-sm">
                Deletes all requests, purchase details, discount details, audit logs, and notifications. Use this to wipe out all testing workflow data.
              </p>
            </div>
            <button
              onClick={handleClearRequests}
              disabled={loading !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-semibold transition-colors flex-shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {loading === 'requests' ? 'Deleting...' : 'Clear All Requests'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden p-6 relative">
          <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pl-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Clear Master Items</h3>
              <p className="text-slate-500 text-sm">
                Deletes all items in the shoe catalog. Use this if you want to upload a completely fresh CSV of items.
              </p>
            </div>
            <button
              onClick={handleClearItems}
              disabled={loading !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg font-semibold transition-colors flex-shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {loading === 'items' ? 'Deleting...' : 'Clear Master Items'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
