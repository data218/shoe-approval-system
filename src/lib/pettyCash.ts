import { supabase } from './supabase';
import { isManagement } from './approvals';
export { isManagement } from './approvals';

export const PETTY_CASH_BUCKET = 'shoe-petty-cash-receipts';



export type PettyCashStage = 'MANAGEMENT' | 'PAYMENT';

export type PettyCashStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_MANAGEMENT'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'SETTLED';



export type PettyCashDecision =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'PAID'
  | 'SETTLED';

export interface PettyCashAttachment {
  path: string;
  name: string;
  size?: number;
  type?: string;
}

export interface PettyCashEmployee {
  full_name: string | null;
  employee_code: string | null;
  department: string | null;
  showroom_location: string | null;
}

export interface PettyCashRequest {
  id: string;
  request_number: string;
  request_date: string;
  branch: string | null;
  employee_id: string | null;
  department: string | null;
  expense_category: string;
  description: string;
  requested_amount: number;
  approved_amount: number | null;
  paid_amount: number;
  status: PettyCashStatus;
  current_stage: PettyCashStage | null;
  requires_management_approval: boolean;
  attachments: PettyCashAttachment[];
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: PettyCashEmployee | null;
}

export interface PettyCashHistoryEntry {
  id: string;
  request_id: string;
  stage: PettyCashStage | null;
  approver_id: string | null;
  approver_name: string | null;
  decision: PettyCashDecision;
  remarks: string | null;
  created_at: string;
}

export interface PettyCashPayment {
  id: string;
  request_id: string;
  payment_amount: number;
  payment_date: string;
  payment_mode: string;
  transaction_reference: string | null;
  voucher_number: string | null;
  settlement_status: 'PAID' | 'PARTIALLY_PAID' | 'SETTLED';
  remarks: string | null;
  attachment_paths: PettyCashAttachment[];
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface PettyCashSettings {
  id: number;
  management_threshold: number;
  management_approval_always: boolean;
  accounts_verification_required: boolean;
  ea_approval_required: boolean;
}

// ---------------------------------------------------------------------------
// Role / permission helpers
// ---------------------------------------------------------------------------
export function canActAtStage(
  role: string | null | undefined,
  stage: PettyCashStage | null | undefined
): boolean {
  return (stage === 'MANAGEMENT' || stage === 'PAYMENT') && isManagement(role);
}

export function canRecordPayment(role: string | null | undefined): boolean {
  return canActAtStage(role, 'PAYMENT');
}

export const STAGE_META: Record<
  PettyCashStage,
  { label: string; short: string; approverRole: string }
> = {
  MANAGEMENT: { label: 'Management approval', short: 'Management', approverRole: 'Management' },
  PAYMENT: { label: 'Payment & settlement', short: 'Payment', approverRole: 'Management' },
};

export const STATUS_META: Record<PettyCashStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  SUBMITTED: { label: 'Submitted', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING_MANAGEMENT: { label: 'Pending Management', className: 'bg-amber-100 text-amber-800 border-amber-200' },

  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  RETURNED: { label: 'Returned for Correction', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  PAID: { label: 'Paid', className: 'bg-teal-100 text-teal-800 border-teal-200' },
  PARTIALLY_PAID: { label: 'Partially Paid', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  SETTLED: { label: 'Settled', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export const EXPENSE_CATEGORIES = [
  'Office Supplies',
  'Courier & Postage',
  'Travel & Conveyance',
  'Food & Refreshments',
  'Fuel',
  'Repairs & Maintenance',
  'Housekeeping',
  'Printing & Stationery',
  'Utility Bills',
  'Medical / Emergency',
  'Miscellaneous',
];

export const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Other'];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (isNaN(num as number)) return '₹0.00';
  return '₹' + (num as number).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Time the request has been in flight: from submission until it is closed
// (rejected/settled) or, while still open, until now.
export function waitingDuration(r: Pick<PettyCashRequest, 'created_at' | 'updated_at' | 'status'>): string {
  const start = new Date(r.created_at).getTime();
  if (isNaN(start)) return '-';
  const closed = r.status === 'REJECTED' || r.status === 'SETTLED';
  const end = closed ? new Date(r.updated_at).getTime() : Date.now();
  return formatDuration((isNaN(end) ? Date.now() : end) - start);
}

export function outstandingAmount(r: PettyCashRequest): number {
  const approved = r.approved_amount ?? r.requested_amount;
  return Math.max(approved - (r.paid_amount || 0), 0);
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
export async function uploadReceipts(
  files: File[],
  userId: string
): Promise<PettyCashAttachment[]> {
  const uploaded: PettyCashAttachment[] = [];
  for (const file of files) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(PETTY_CASH_BUCKET).upload(path, file);
    if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`);
    uploaded.push({ path, name: file.name, size: file.size, type: file.type });
  }
  return uploaded;
}

export async function getSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PETTY_CASH_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Data access (RPCs enforce the workflow & authorisation server-side)
// ---------------------------------------------------------------------------
export async function fetchRequests(): Promise<PettyCashRequest[]> {
  const { data, error } = await supabase
    .from('shoe_petty_cash_requests')
    .select(
      `*,
       employee:shoe_profiles!employee_id(full_name, employee_code, department, showroom_location)`
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as PettyCashRequest[];
}

export async function fetchSettings(): Promise<PettyCashSettings | null> {
  const { data, error } = await supabase
    .from('shoe_petty_cash_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return null;
  return (data as PettyCashSettings) || null;
}

export async function fetchHistory(requestId: string): Promise<PettyCashHistoryEntry[]> {
  const { data, error } = await supabase
    .from('shoe_petty_cash_approval_history')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as PettyCashHistoryEntry[];
}

export async function fetchPayments(requestId: string): Promise<PettyCashPayment[]> {
  const { data, error } = await supabase
    .from('shoe_petty_cash_payments')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as PettyCashPayment[];
}

export interface CreatePettyCashPayload {
  expense_category: string;
  description: string;
  requested_amount: number;
  branch?: string;
  department?: string;
  remarks?: string;
  request_date?: string;
  attachments?: PettyCashAttachment[];
}

export async function createPettyCashRequest(
  payload: CreatePettyCashPayload
): Promise<PettyCashRequest> {
  const { data, error } = await supabase.rpc('shoe_petty_cash_create_request', {
    p_expense_category: payload.expense_category,
    p_description: payload.description,
    p_requested_amount: payload.requested_amount,
    p_branch: payload.branch ?? null,
    p_department: payload.department ?? null,
    p_remarks: payload.remarks ?? null,
    p_request_date: payload.request_date ?? null,
    p_attachments: payload.attachments ?? [],
  });
  if (error) throw error;
  const request = data as PettyCashRequest;
  return request;
}


export async function updatePettyCashRequest(
  id: string,
  payload: Partial<CreatePettyCashPayload>
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.expense_category !== undefined) update.expense_category = payload.expense_category;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.requested_amount !== undefined) update.requested_amount = payload.requested_amount;
  if (payload.branch !== undefined) update.branch = payload.branch;
  if (payload.department !== undefined) update.department = payload.department;
  if (payload.remarks !== undefined) update.remarks = payload.remarks;
  if (payload.attachments !== undefined) update.attachments = payload.attachments;

  const { error } = await supabase.from('shoe_petty_cash_requests').update(update).eq('id', id);
  if (error) throw error;
}

export async function actOnRequest(
  requestId: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  remarks?: string
): Promise<PettyCashRequest> {
  const { data, error } = await supabase.rpc('shoe_petty_cash_action', {
    p_request_id: requestId,
    p_action: action,
    p_remarks: remarks ?? null,
  });
  if (error) throw error;
  return data as PettyCashRequest;
}

export async function resubmitRequest(requestId: string): Promise<PettyCashRequest> {
  const { data, error } = await supabase.rpc('shoe_petty_cash_resubmit', {
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as PettyCashRequest;
}

export interface RecordPaymentPayload {
  request_id: string;
  payment_amount: number;
  payment_mode: string;
  payment_date?: string;
  transaction_reference?: string;
  voucher_number?: string;
  remarks?: string;
  attachment_paths?: PettyCashAttachment[];
}

export async function recordPayment(
  payload: RecordPaymentPayload
): Promise<PettyCashRequest> {
  const { data, error } = await supabase.rpc('shoe_petty_cash_record_payment', {
    p_request_id: payload.request_id,
    p_payment_amount: payload.payment_amount,
    p_payment_mode: payload.payment_mode,
    p_payment_date: payload.payment_date ?? null,
    p_transaction_reference: payload.transaction_reference ?? null,
    p_voucher_number: payload.voucher_number ?? null,
    p_remarks: payload.remarks ?? null,
    p_attachment_paths: payload.attachment_paths ?? [],
  });
  if (error) throw error;
  return data as PettyCashRequest;
}
