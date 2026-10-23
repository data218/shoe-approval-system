import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCircle, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isManagement } from '../lib/approvals';
import { pendingApprovalAlerts } from '../lib/notificationAlerts';
import type { ApprovalAlert } from '../lib/notificationAlerts';
import { Link } from 'react-router-dom';

interface Notification {
  id: string;
  message: string;
  is_read: boolean;
  request_id: string | null;
  created_at: string;
}

export default function NotificationsDropdown() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const role = profile?.role;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tasks, setTasks] = useState<ApprovalAlert[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);

  const fetchAlerts = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    const results = await Promise.allSettled([
      supabase.from('shoe_notifications').select('*').eq('user_id', userId).eq('is_read', false)
        .order('created_at', { ascending: false }).limit(20),
      isManagement(role)
        ? supabase.from('shoe_requests').select('id,display_id,type,requester_id,status,created_at').eq('status', 'PENDING_MANAGEMENT')
        : Promise.resolve({ data: [], error: null }),
      isManagement(role)
        ? supabase.from('shoe_petty_cash_requests').select('id,request_number,employee_id,status,created_at').eq('status', 'PENDING_MANAGEMENT')
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (requestVersion.current !== version) return;
    const [notificationsResult, requestsResult, pettyResult] = results;
    const success = (result: PromiseSettledResult<{ error: unknown }>) => result.status === 'fulfilled' && !result.value.error;
    if (notificationsResult.status === 'fulfilled' && !notificationsResult.value.error) {
      setNotifications((notificationsResult.value.data || []) as Notification[]);
    }
    setTasks((previous) => {
      const requestTasks = requestsResult.status === 'fulfilled' && !requestsResult.value.error
        ? pendingApprovalAlerts(role, userId, requestsResult.value.data || [], [])
        : previous.filter((task) => task.id.startsWith('request:'));
      const pettyTasks = pettyResult.status === 'fulfilled' && !pettyResult.value.error
        ? pendingApprovalAlerts(role, userId, [], pettyResult.value.data || [])
        : previous.filter((task) => task.id.startsWith('petty-cash:'));
      return [...requestTasks, ...pettyTasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    setLoadError(results.every(success) ? null : 'Some alerts could not be loaded. Please retry.');
    setLoading(false);
  }, [userId, role]);

  useEffect(() => {
    setNotifications([]);
    setTasks([]);
    void fetchAlerts();
    if (!userId) return;
    const refresh = () => { if (document.visibilityState !== 'hidden') void fetchAlerts(); };
    const channel = supabase.channel(`alerts:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shoe_notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      requestVersion.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      void supabase.removeChannel(channel);
    };
  }, [fetchAlerts, userId]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, []);

  const markRead = async (id?: string) => {
    if (!userId) return;
    setSaving(true);
    try {
      let query = supabase.from('shoe_notifications').update({ is_read: true }).eq('user_id', userId);
      query = id ? query.eq('id', id) : query.eq('is_read', false);
      const { error } = await query;
      if (error) throw error;
      setNotifications((previous) => id ? previous.filter((n) => n.id !== id) : []);
      setLoadError(null);
    } catch {
      setLoadError('Could not mark notifications as read. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  // A pending task already explains its notification; avoid duplicate entries.
  const updates = notifications.filter((n) => !tasks.some((task) =>
    task.id === `request:${n.request_id}` || n.message.includes(task.reference)));
  const alertCount = tasks.length + updates.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button type="button" aria-label={`Notifications, ${alertCount} alerts`} aria-expanded={isOpen}
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) void fetchAlerts(); }}
        className="p-2 text-amber-500 hover:text-amber-600 relative rounded-full hover:bg-amber-50 transition-colors">
        <Bell className="w-5 h-5" />
        {alertCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">{alertCount > 99 ? '99+' : alertCount}</span>}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-100 bg-white py-2 shadow-lg z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
            <div className="flex items-center gap-2">
              {updates.length > 0 && <button type="button" disabled={saving} onClick={() => void markRead()} className="text-xs text-brand-600 disabled:opacity-50">Mark updates read</button>}
              <button type="button" aria-label="Refresh notifications" disabled={loading} onClick={() => void fetchAlerts()} className="p-1 text-slate-500"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>
          {loadError && <p role="alert" className="m-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{loadError}</p>}
          <div className="max-h-96 overflow-y-auto">
            {tasks.length > 0 && (
              <section>
                <h4 className="px-4 pt-3 text-xs font-bold uppercase text-amber-700">Pending approvals ({tasks.length})</h4>
                <p className="px-4 pt-1 text-xs text-slate-500">These stay visible until a decision is made.</p>
                {tasks.map((task) => <Link key={task.id} to={task.href} onClick={() => setIsOpen(false)} className="flex gap-2 border-b border-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-amber-50">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>{task.message}</span>
                </Link>)}
              </section>
            )}
            {updates.map((notification) => <div key={notification.id} className="border-b border-slate-50 px-4 py-3 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-700">{notification.message}</p>
                <button type="button" disabled={saving} aria-label="Mark notification as read" onClick={() => void markRead(notification.id)} className="text-slate-400 hover:text-brand-600"><CheckCircle className="h-4 w-4" /></button>
              </div>
              <div className="mt-1 flex justify-between gap-2 text-xs text-slate-400">
                <span>{new Date(notification.created_at).toLocaleString()}</span>
                <Link to={notification.request_id ? '/dashboard/inbox' : '/dashboard/petty-cash'} onClick={() => setIsOpen(false)} className="text-brand-600">View request</Link>
              </div>
            </div>)}
            {!loadError && alertCount === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">{loading ? 'Checking notifications…' : 'No new notifications or pending approvals'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
