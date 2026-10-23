/** One management decision completes approval for every request type. */
export const MANAGEMENT_ROLES = ['ADMIN', 'NARENDRA', 'SANJEEV'] as const;

export function isManagement(role: string | null | undefined): boolean {
  return MANAGEMENT_ROLES.some((managementRole) => managementRole === role);
}

export function canApproveRequest(
  role: string | null | undefined,
  requesterId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  return !!userId && isManagement(role) && (requesterId !== userId || role === 'ADMIN');
}
