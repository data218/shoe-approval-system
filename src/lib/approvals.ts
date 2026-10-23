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

// Keep the existing database role IDs so deployed policies and existing users
// remain compatible. The application presents roles, never personal names.
export const USER_ROLE_OPTIONS = [
  { value: 'REQUESTER', label: 'Requester' },
  { value: 'NARENDRA', label: 'Management' },
  { value: 'ADMIN', label: 'Admin' },
] as const;

export function getRoleOptionValue(role: string | null | undefined): string {
  if (role === 'ADMIN') return 'ADMIN';
  return isManagement(role) ? 'NARENDRA' : 'REQUESTER';
}

export function getRoleLabel(role: string | null | undefined): string {
  const value = getRoleOptionValue(role);
  return USER_ROLE_OPTIONS.find((option) => option.value === value)!.label;
}
