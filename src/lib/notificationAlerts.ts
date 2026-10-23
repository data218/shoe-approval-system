import { canApproveRequest } from './approvals.ts';

export interface PendingRequest {
  id: string;
  status: string;
  created_at: string;
  requester_id?: string | null;
  employee_id?: string | null;
  display_id?: string;
  request_number?: string;
  type?: string;
}

export interface ApprovalAlert {
  id: string;
  reference: string;
  message: string;
  href: string;
  created_at: string;
}

/** Tasks are derived from pending requests, not dependent on notification delivery. */
export function pendingApprovalAlerts(
  role: string | null | undefined,
  userId: string,
  requests: PendingRequest[],
  pettyCash: PendingRequest[],
): ApprovalAlert[] {
  return [
    ...requests.filter((r) => r.status === 'PENDING_MANAGEMENT' && canApproveRequest(role, r.requester_id, userId))
      .map((r) => ({ id: `request:${r.id}`, reference: r.display_id || r.id,
        message: `${r.type === 'DISCOUNT' ? 'Discount' : 'Purchase'} ${r.display_id || ''} needs your approval.`,
        href: '/dashboard/inbox', created_at: r.created_at })),
    ...pettyCash.filter((r) => r.status === 'PENDING_MANAGEMENT' && canApproveRequest(role, r.employee_id, userId))
      .map((r) => ({ id: `petty-cash:${r.id}`, reference: r.request_number || r.id,
        message: `Petty cash ${r.request_number || ''} needs your approval.`,
        href: '/dashboard/petty-cash', created_at: r.created_at })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
