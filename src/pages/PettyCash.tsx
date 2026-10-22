import { useState, useEffect, useMemo } from 'react';
import type { ChangeEvent, ComponentType, FormEvent, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Pagination } from '../components/Pagination';
import {
  fetchRequests,
  fetchHistory,
  fetchPayments,
  createPettyCashRequest,
  updatePettyCashRequest,
  actOnRequest,
  resubmitRequest,
  recordPayment,
  uploadReceipts,
  getSignedUrl,
  outstandingAmount,
  formatCurrency,
  formatDate,
  waitingDuration,
  canActAtStage,
  canRecordPayment,
  isManagement,
  STAGE_META,
  STATUS_META,
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
} from '../lib/pettyCash';
import type {
  PettyCashAttachment,
  PettyCashHistoryEntry,
  PettyCashPayment,
  PettyCashRequest,
  PettyCashStage,
  PettyCashStatus,
} from '../lib/pettyCash';
import {
  Wallet,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  CheckCircle2,
  XCircle,
  CornerUpLeft,
  Clock,
  Banknote,
  Paperclip,
  UploadCloud,
  X,
  AlertCircle,
  Send,
  IndianRupee,
  ArrowUpDown,
} from 'lucide-react';

const PENDING_STATUSES: PettyCashStatus[] = [
  'PENDING_MANAGER',
  'PENDING_ACCOUNTS',
  'PENDING_EA',
];
const APPROVED_STATUSES: PettyCashStatus[] = ['APPROVED', 'PAID', 'PARTIALLY_PAID', 'SETTLED'];

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className={`p-5 rounded-2xl border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${tone}`}>
      <div className="flex items-center justify-between relative z-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</p>
          <h3 className="text-2xl font-black mt-2">{value}</h3>
        </div>
        <div className="w-12 h-12 bg-white/60 rounded-2xl flex items-center justify-center shadow-sm">
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PettyCashStatus }) {
  const meta = STATUS_META[status] || { label: status, className: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${meta.className}`}>
      {meta.label}
    </span>
  );
}

interface FormState {
  request_date: string;
  branch: string;
  department: string;
  expense_category: string;
  description: string;
  requested_amount: string;
  remarks: string;
}

const emptyForm = (branch: string, department: string): FormState => ({
  request_date: new Date().toISOString().slice(0, 10),
  branch,
  department,
  expense_category: '',
  description: '',
  requested_amount: '',
  remarks: '',
});

export default function PettyCash() {
  const { user, profile } = useAuth();

  const [requests, setRequests] = useState<PettyCashRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [sortField, setSortField] = useState<'created_at' | 'request_date' | 'requested_amount' | 'request_number'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm('', ''));
  const [existingAttachments, setExistingAttachments] = useState<PettyCashAttachment[]>([]);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail modal
  const [selected, setSelected] = useState<PettyCashRequest | null>(null);
  const [history, setHistory] = useState<PettyCashHistoryEntry[]>([]);
  const [payments, setPayments] = useState<PettyCashPayment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Approval action
  const [remarks, setRemarks] = useState('');
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | 'RETURN' | 'RESUBMIT' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    payment_amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'Cash',
    transaction_reference: '',
    voucher_number: '',
    remarks: '',
  });
  const [paymentFiles, setPaymentFiles] = useState<File[]>([]);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  useEffect(() => {
    if (profile) fetchAll();
  }, [profile]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = async (): Promise<PettyCashRequest[]> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchRequests();
      setRequests(data);
      return data;
    } catch (err: any) {
      setError(
        err?.message?.includes('does not exist') || err?.code === '42P01'
          ? 'The petty cash tables were not found. Please run the petty cash migration in Supabase.'
          : err?.message || 'Failed to load petty cash requests.'
      );
      return [];
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------
  const branches = useMemo(
    () => Array.from(new Set(requests.map((r) => r.branch).filter((b): b is string => !!b))),
    [requests]
  );
  const categories = useMemo(
    () => Array.from(new Set(requests.map((r) => r.expense_category).filter(Boolean))),
    [requests]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const rows = requests.filter((r) => {
      if (statusFilter === 'PENDING' && !PENDING_STATUSES.includes(r.status)) return false;
      if (statusFilter && statusFilter !== 'PENDING' && r.status !== statusFilter) return false;
      if (categoryFilter && r.expense_category !== categoryFilter) return false;
      if (branchFilter && r.branch !== branchFilter) return false;
      if (!term) return true;
      const haystack = [
        r.request_number,
        r.branch,
        r.department,
        r.expense_category,
        r.description,
        r.employee?.full_name,
        r.employee?.employee_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av: any = '';
      let bv: any = '';
      if (sortField === 'requested_amount') {
        av = Number(a.requested_amount) || 0;
        bv = Number(b.requested_amount) || 0;
      } else {
        av = a[sortField] || '';
        bv = b[sortField] || '';
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [requests, searchTerm, statusFilter, categoryFilter, branchFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => PENDING_STATUSES.includes(r.status)).length;
    const approved = requests.filter((r) => APPROVED_STATUSES.includes(r.status)).length;
    const rejected = requests.filter((r) => r.status === 'REJECTED').length;
    const requestedAmount = requests.reduce((s, r) => s + Number(r.requested_amount || 0), 0);
    const approvedAmount = requests.reduce((s, r) => s + Number(r.approved_amount || 0), 0);
    const paidAmount = requests.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const pendingSettlement = requests
      .filter((r) => APPROVED_STATUSES.includes(r.status))
      .reduce((s, r) => s + outstandingAmount(r), 0);
    return { total, pending, approved, rejected, requestedAmount, approvedAmount, paidAmount, pendingSettlement };
  }, [requests]);

  const pageRows = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(profile?.showroom_location || '', profile?.department || ''));
    setExistingAttachments([]);
    setReceiptFiles([]);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (r: PettyCashRequest) => {
    setEditingId(r.id);
    setForm({
      request_date: r.request_date,
      branch: r.branch || '',
      department: r.department || '',
      expense_category: r.expense_category,
      description: r.description,
      requested_amount: String(r.requested_amount),
      remarks: r.remarks || '',
    });
    setExistingAttachments(r.attachments || []);
    setReceiptFiles([]);
    setFormError(null);
    setFormOpen(true);
  };

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setReceiptFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = parseFloat(form.requested_amount);
    if (!form.expense_category.trim()) return setFormError('Please select an expense category.');
    if (!form.description.trim()) return setFormError('Please provide an expense description.');
    if (!amount || amount <= 0) return setFormError('Requested amount must be greater than zero.');

    try {
      setSubmitting(true);
      setFormError(null);

      const newAttachments = receiptFiles.length ? await uploadReceipts(receiptFiles, user.id) : [];
      const attachments = [...existingAttachments, ...newAttachments];

      if (editingId) {
        await updatePettyCashRequest(editingId, {
          branch: form.branch,
          department: form.department,
          expense_category: form.expense_category,
          description: form.description,
          requested_amount: amount,
          remarks: form.remarks,
          attachments,
        });
        setToast('Request updated. Remember to resubmit it for approval.');
      } else {
        const created = await createPettyCashRequest({
          branch: form.branch,
          department: form.department,
          expense_category: form.expense_category,
          description: form.description,
          requested_amount: amount,
          remarks: form.remarks,
          request_date: form.request_date,
          attachments,
        });
        setToast(`Request ${created.request_number} submitted successfully.`);
      }
      setFormOpen(false);
      await fetchAll();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save the request.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (r: PettyCashRequest) => {
    setSelected(r);
    setRemarks('');
    setPendingAction(null);
    setHistory([]);
    setPayments([]);
    setSignedUrls({});
    setPaymentForm({
      payment_amount: String(outstandingAmount(r) || ''),
      payment_date: new Date().toISOString().slice(0, 10),
      payment_mode: 'Cash',
      transaction_reference: '',
      voucher_number: '',
      remarks: '',
    });
    setPaymentFiles([]);

    try {
      setDetailLoading(true);
      const [h, p] = await Promise.all([fetchHistory(r.id), fetchPayments(r.id)]);
      setHistory(h);
      setPayments(p);

      const urls: Record<string, string> = {};
      for (const att of r.attachments || []) {
        const url = await getSignedUrl(att.path);
        if (url) urls[att.path] = url;
      }
      setSignedUrls(urls);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!selected || !pendingAction) return;
    if ((pendingAction === 'REJECT' || pendingAction === 'RETURN') && !remarks.trim()) {
      alert('Remarks are mandatory when rejecting or returning a request.');
      return;
    }
    try {
      setActionLoading(true);
      if (pendingAction === 'RESUBMIT') {
        await resubmitRequest(selected.id);
        setToast('Request resubmitted for approval.');
      } else {
        await actOnRequest(selected.id, pendingAction, remarks.trim());
        setToast(
          `Request ${pendingAction === 'APPROVE' ? 'approved' : pendingAction === 'REJECT' ? 'rejected' : 'returned'}.`
        );
      }
      const requestId = selected.id;
      setPendingAction(null);
      setRemarks('');
      const data = await fetchAll();
      const fresh = data.find((r) => r.id === requestId);
      if (fresh) await openDetail(fresh);
      else setSelected(null);
    } catch (err: any) {
      alert(err?.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !user) return;
    const amount = parseFloat(paymentForm.payment_amount);
    if (!amount || amount <= 0) return alert('Payment amount must be greater than zero.');
    if (amount > outstandingAmount(selected) + 0.001) return alert('Payment exceeds the outstanding amount.');

    try {
      setPaymentSubmitting(true);
      const newAttachments = paymentFiles.length ? await uploadReceipts(paymentFiles, user.id) : [];
      await recordPayment({
        request_id: selected.id,
        payment_amount: amount,
        payment_mode: paymentForm.payment_mode,
        payment_date: paymentForm.payment_date,
        transaction_reference: paymentForm.transaction_reference,
        voucher_number: paymentForm.voucher_number,
        remarks: paymentForm.remarks,
        attachment_paths: newAttachments,
      });
      setToast('Payment recorded successfully.');
      setPaymentFiles([]);
      const requestId = selected.id;
      const data = await fetchAll();
      const fresh = data.find((r) => r.id === requestId);
      if (fresh) await openDetail(fresh);
    } catch (err: any) {
      alert(err?.message || 'Failed to record payment.');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setCategoryFilter('');
    setBranchFilter('');
    setCurrentPage(1);
  };

  const role = profile?.role || null;
  const effectiveStage = selected?.current_stage;
  const isL2 = role?.includes('L2');
  const isMgmt = isManagement(role);
  const canApprove = selected
    ? PENDING_STATUSES.includes(selected.status) &&
      (effectiveStage === 'EA' || effectiveStage === 'ACCOUNTS') &&
      (isMgmt || isL2) &&
      (selected.employee_id !== user?.id || isMgmt)
    : false;
  const isOwner = !!selected && selected.employee_id === user?.id;
  const canEdit = isOwner && selected?.status === 'RETURNED';
  const canResubmit = isOwner && selected?.status === 'RETURNED';
  const showPayment = !!selected && canRecordPayment(role) && ['APPROVED', 'PARTIALLY_PAID'].includes(selected.status);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500 relative">
      {toast && (
        <div className="fixed top-20 right-6 z-[60] bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Wallet className="w-8 h-8 text-brand-600" />
            Petty Cash Approval
          </h1>
          <p className="text-slate-500 mt-1">
            Raise, approve, pay and settle petty cash expenses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => { await fetchAll(); }}
            disabled={loading}
            className="p-2.5 text-slate-400 hover:text-brand-600 bg-white rounded-xl border border-slate-200 shadow-sm transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreate}
            className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Petty Cash Request
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={stats.total} icon={Wallet} tone="bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200 text-slate-700" />
        <StatCard label="Pending Approvals" value={stats.pending} icon={Clock} tone="bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200 text-amber-800" />
        <StatCard label="Approved Requests" value={stats.approved} icon={CheckCircle2} tone="bg-gradient-to-br from-emerald-50 to-teal-100 border-emerald-200 text-emerald-800" />
        <StatCard label="Rejected Requests" value={stats.rejected} icon={XCircle} tone="bg-gradient-to-br from-rose-50 to-red-100 border-rose-200 text-rose-800" />
        <StatCard label="Total Requested" value={formatCurrency(stats.requestedAmount)} icon={IndianRupee} tone="bg-gradient-to-br from-indigo-50 to-blue-100 border-indigo-200 text-indigo-800" />
        <StatCard label="Total Approved" value={formatCurrency(stats.approvedAmount)} icon={CheckCircle2} tone="bg-gradient-to-br from-teal-50 to-cyan-100 border-teal-200 text-teal-800" />
        <StatCard label="Total Paid" value={formatCurrency(stats.paidAmount)} icon={Banknote} tone="bg-gradient-to-br from-cyan-50 to-sky-100 border-cyan-200 text-cyan-800" />
        <StatCard label="Pending Settlement" value={formatCurrency(stats.pendingSettlement)} icon={Banknote} tone="bg-gradient-to-br from-purple-50 to-fuchsia-100 border-purple-200 text-purple-800" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search request ID, employee, description..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">All Pending</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={branchFilter}
          onChange={(e) => {
            setBranchFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
        >
          <option value="">All Branches</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as typeof sortField)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
          >
            <option value="created_at">Sort: Created</option>
            <option value="request_date">Sort: Request Date</option>
            <option value="requested_amount">Sort: Amount</option>
            <option value="request_number">Sort: Request ID</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="p-2 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50"
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={resetFilters}
          className="text-sm font-medium text-slate-500 hover:text-brand-600 px-2 py-2"
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Wallet className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-lg font-medium">No petty cash requests</p>
            <p className="text-sm">
              {requests.length === 0
                ? 'Click "New Petty Cash Request" to raise the first one.'
                : 'No requests match your filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-brand-600 to-purple-600 text-white text-xs uppercase tracking-wider font-bold">
                    <th className="px-4 py-3 rounded-tl-lg whitespace-nowrap">Request ID</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 whitespace-nowrap">Waiting Duration</th>
                    <th className="px-4 py-3 whitespace-nowrap">Branch</th>
                    <th className="px-4 py-3 whitespace-nowrap">Employee</th>
                    <th className="px-4 py-3 whitespace-nowrap">Department</th>
                    <th className="px-4 py-3 whitespace-nowrap">Category</th>
                    <th className="px-4 py-3 whitespace-nowrap">Description</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Requested Amount</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Approved</th>
                    <th className="px-4 py-3 whitespace-nowrap">Current Approver</th>
                    <th className="px-4 py-3 whitespace-nowrap text-center">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{r.request_number}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatDate(r.request_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{waitingDuration(r)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{r.branch && !r.branch.includes('@') ? r.branch : (profile?.showroom_location || '-')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-800">{r.employee?.full_name || '-'}</div>
                        <div className="text-xs text-slate-400">{r.employee?.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{r.department || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {r.expense_category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[220px] truncate" title={r.description}>
                        {r.description}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right whitespace-nowrap">
                        {formatCurrency(r.requested_amount)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-700 text-right whitespace-nowrap">
                        {r.approved_amount != null ? formatCurrency(r.approved_amount) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {r.current_stage ? STAGE_META[r.current_stage]?.approverRole || STAGE_META[r.current_stage]?.short || r.current_stage : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(r)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            title="View / Review"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {r.employee_id === user?.id && r.status === 'RETURNED' && (
                            <button
                              onClick={() => openEdit(r)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalItems={filtered.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(v) => {
                setItemsPerPage(v);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit form modal                                            */}
      {/* ------------------------------------------------------------------ */}
      {formOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-brand-600" />
                {editingId ? 'Edit Petty Cash Request' : 'New Petty Cash Request'}
              </h3>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitForm} className="flex flex-col overflow-hidden">
              <div className="p-6 space-y-5 overflow-y-auto">
                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Request ID</label>
                    <input
                      type="text"
                      value={editingId ? requests.find((r) => r.id === editingId)?.request_number || '' : 'Auto-generated'}
                      disabled
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Request Date *</label>
                    <input
                      type="date"
                      required
                      value={form.request_date}
                      onChange={(e) => setForm({ ...form, request_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Branch / Location</label>
                    <input
                      type="text"
                      value={form.branch}
                      onChange={(e) => setForm({ ...form, branch: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Employee Name</label>
                    <input
                      type="text"
                      value={profile?.full_name || ''}
                      disabled
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                    <input
                      type="text"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Expense Category *</label>
                    <select
                      required
                      value={form.expense_category}
                      onChange={(e) => setForm({ ...form, expense_category: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm bg-white"
                    >
                      <option value="" disabled>
                        Select category...
                      </option>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expense Description *</label>
                  <textarea
                    required
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe the expense and its business purpose..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Requested Amount (₹) *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={form.requested_amount}
                      onChange={(e) => setForm({ ...form, requested_amount: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                    <input
                      type="text"
                      value={form.remarks}
                      onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bill / Receipt Attachments</label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex flex-col items-center justify-center">
                      <UploadCloud className="w-6 h-6 text-slate-400 mb-1" />
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold">Click to upload</span> (multiple allowed)
                      </p>
                    </div>
                    <input type="file" multiple className="hidden" accept="image/*,.pdf" onChange={handleFiles} />
                  </label>

                  {(existingAttachments.length > 0 || receiptFiles.length > 0) && (
                    <ul className="mt-3 space-y-1.5">
                      {existingAttachments.map((a) => (
                        <li key={a.path} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                          <span className="flex items-center gap-2 text-slate-600 truncate">
                            <Paperclip className="w-3.5 h-3.5" /> {a.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setExistingAttachments((prev) => prev.filter((x) => x.path !== a.path))}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                      {receiptFiles.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-brand-50 border border-brand-100 rounded-lg px-3 py-1.5">
                          <span className="flex items-center gap-2 text-brand-700 truncate">
                            <Paperclip className="w-3.5 h-3.5" /> {f.name} (new)
                          </span>
                          <button
                            type="button"
                            onClick={() => setReceiptFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-brand-400 hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-brand-600 text-white font-semibold hover:bg-brand-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {editingId ? 'Save Changes' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Detail / approval modal                                             */}
      {/* ------------------------------------------------------------------ */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-slate-900">{selected.request_number}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <p className="text-sm text-slate-500">
                  Raised by {selected.employee?.full_name || 'Unknown'} on {formatDate(selected.request_date)}
                  {selected.current_stage && (
                    <span className="ml-2 text-brand-600 font-medium">
                      • Awaiting {STAGE_META[selected.current_stage]?.short}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Summary grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Detail label="Branch" value={selected.branch || '-'} />
                <Detail label="Department" value={selected.department || '-'} />
                <Detail label="Category" value={selected.expense_category} />
                <Detail label="Requested" value={formatCurrency(selected.requested_amount)} />
                <Detail label="Approved" value={selected.approved_amount != null ? formatCurrency(selected.approved_amount) : '-'} />
                <Detail label="Paid" value={formatCurrency(selected.paid_amount)} />
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Expense Description</h3>
                <p className="text-slate-700 whitespace-pre-wrap text-sm">{selected.description}</p>
                {selected.remarks && <p className="text-xs text-slate-500 mt-2 italic">Remarks: {selected.remarks}</p>}
              </div>

              {/* Attachments */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Paperclip className="w-4 h-4" /> Receipts ({selected.attachments?.length || 0})
                </h3>
                {!selected.attachments || selected.attachments.length === 0 ? (
                  <p className="text-sm text-slate-400">No receipts attached.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selected.attachments.map((a) => (
                      <a
                        key={a.path}
                        href={signedUrls[a.path] || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm transition-colors ${
                          signedUrls[a.path] ? 'hover:bg-slate-50 text-brand-600' : 'text-slate-400 pointer-events-none'
                        }`}
                      >
                        <Paperclip className="w-4 h-4 shrink-0" />
                        <span className="truncate">{a.name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Approval history */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Approval History</h3>
                {detailLoading ? (
                  <div className="flex justify-center py-6 text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-400">No history yet.</p>
                ) : (
                  <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
                    {history.map((h) => (
                      <li key={h.id} className="ml-5">
                        <span className={`absolute -left-[9px] mt-1 w-4 h-4 rounded-full border-2 border-white ${decisionDot(h.decision)}`} />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{h.approver_name || 'User'}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${decisionBadge(h.decision)}`}>
                            {decisionLabel(h.decision)}
                          </span>
                          {h.stage && <span className="text-xs text-slate-400">at {STAGE_META[h.stage as PettyCashStage]?.short}</span>}
                        </div>
                        {h.remarks && <p className="text-sm text-slate-600 mt-1 italic">"{h.remarks}"</p>}
                        <p className="text-xs text-slate-400 mt-0.5">{new Date(h.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Payments */}
              {(payments.length > 0 || ['APPROVED', 'PARTIALLY_PAID', 'SETTLED', 'PAID'].includes(selected.status)) && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <Banknote className="w-4 h-4" /> Payments & Settlement
                  </h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-slate-600">
                      Approved: <b className="text-slate-900">{formatCurrency(selected.approved_amount ?? selected.requested_amount)}</b>
                    </span>
                    <span className="text-slate-600">
                      Paid: <b className="text-slate-900">{formatCurrency(selected.paid_amount)}</b>
                    </span>
                    <span className="text-slate-600">
                      Outstanding: <b className="text-rose-600">{formatCurrency(outstandingAmount(selected))}</b>
                    </span>
                  </div>
                  {payments.length > 0 && (
                    <div className="space-y-2">
                      {payments.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border border-slate-100 rounded-lg px-3 py-2">
                          <span className="font-semibold text-slate-800">{formatCurrency(p.payment_amount)}</span>
                          <span className="text-slate-500">{p.payment_mode} • {formatDate(p.payment_date)}</span>
                          {p.transaction_reference && <span className="text-xs text-slate-400">Ref: {p.transaction_reference}</span>}
                          {p.voucher_number && <span className="text-xs text-slate-400">Voucher: {p.voucher_number}</span>}
                          <span className="text-xs text-slate-400">by {p.recorded_by_name || 'Accounts'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Record payment form */}
              {showPayment && (
                <form onSubmit={submitPayment} className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                    <Banknote className="w-4 h-4" /> Record Payment
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Field label="Payment Amount (₹) *">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        max={outstandingAmount(selected)}
                        value={paymentForm.payment_amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_amount: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      />
                    </Field>
                    <Field label="Payment Date">
                      <input
                        type="date"
                        value={paymentForm.payment_date}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      />
                    </Field>
                    <Field label="Payment Mode">
                      <select
                        value={paymentForm.payment_mode}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                      >
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Transaction Ref">
                      <input
                        type="text"
                        value={paymentForm.transaction_reference}
                        onChange={(e) => setPaymentForm({ ...paymentForm, transaction_reference: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      />
                    </Field>
                    <Field label="Voucher No.">
                      <input
                        type="text"
                        value={paymentForm.voucher_number}
                        onChange={(e) => setPaymentForm({ ...paymentForm, voucher_number: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      />
                    </Field>
                    <Field label="Remarks">
                      <input
                        type="text"
                        value={paymentForm.remarks}
                        onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      />
                    </Field>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Settlement Documents</label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      onChange={(e) => setPaymentFiles(Array.from(e.target.files || []))}
                      className="text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={paymentSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {paymentSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                    Record Payment
                  </button>
                </form>
              )}
            </div>

            {/* Action footer */}
            {(canApprove || canResubmit || canEdit) && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
                {pendingAction ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {pendingAction === 'APPROVE' && 'Confirm approval?'}
                      {pendingAction === 'REJECT' && 'Confirm rejection? Remarks are required.'}
                      {pendingAction === 'RETURN' && 'Return this request for correction? Remarks are required.'}
                      {pendingAction === 'RESUBMIT' && 'Resubmit this request for approval?'}
                    </p>
                    {(pendingAction === 'REJECT' || pendingAction === 'RETURN') && (
                      <textarea
                        rows={2}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Enter remarks (mandatory)..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm resize-none"
                      />
                    )}
                    <div className="flex gap-3">
                      <button
                        disabled={actionLoading}
                        onClick={confirmAction}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        {actionLoading ? 'Processing...' : 'Confirm'}
                      </button>
                      <button
                        disabled={actionLoading}
                        onClick={() => {
                          setPendingAction(null);
                          setRemarks('');
                        }}
                        className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {canApprove && (
                      <textarea
                        rows={2}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Approval remarks (optional for approve, required for reject/return)..."
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 outline-none text-sm resize-none"
                      />
                    )}
                    <div className="flex flex-wrap gap-3">
                      {canApprove && (
                        <>
                          <button
                            onClick={() => setPendingAction('APPROVE')}
                            className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium shadow-sm transition-colors flex justify-center items-center gap-2"
                          >
                            <CheckCircle2 className="w-5 h-5" /> Approve
                          </button>
                          <button
                            onClick={() => setPendingAction('RETURN')}
                            className="flex-1 min-w-[120px] bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2.5 rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                          >
                            <CornerUpLeft className="w-5 h-5" /> Return
                          </button>
                          <button
                            onClick={() => setPendingAction('REJECT')}
                            className="flex-1 min-w-[120px] bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2.5 rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                          >
                            <XCircle className="w-5 h-5" /> Reject
                          </button>
                        </>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => {
                            setSelected(null);
                            openEdit(selected);
                          }}
                          className="flex-1 min-w-[120px] bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                        >
                          <Pencil className="w-5 h-5" /> Edit
                        </button>
                      )}
                      {canResubmit && (
                        <button
                          onClick={() => setPendingAction('RESUBMIT')}
                          className="flex-1 min-w-[120px] bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                        >
                          <Send className="w-5 h-5" /> Resubmit
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function decisionLabel(d: string): string {
  switch (d) {
    case 'SUBMITTED':
      return 'Submitted';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'RETURNED':
      return 'Returned';
    case 'PAID':
      return 'Paid';
    case 'SETTLED':
      return 'Settled';
    default:
      return d;
  }
}

function decisionBadge(d: string): string {
  switch (d) {
    case 'APPROVED':
      return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED':
      return 'bg-red-100 text-red-700';
    case 'RETURNED':
      return 'bg-amber-100 text-amber-700';
    case 'PAID':
      return 'bg-teal-100 text-teal-700';
    case 'SETTLED':
      return 'bg-emerald-100 text-emerald-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function decisionDot(d: string): string {
  switch (d) {
    case 'APPROVED':
      return 'bg-emerald-500';
    case 'REJECTED':
      return 'bg-red-500';
    case 'RETURNED':
      return 'bg-amber-500';
    case 'PAID':
    case 'SETTLED':
      return 'bg-teal-500';
    default:
      return 'bg-slate-400';
  }
}
