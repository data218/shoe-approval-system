export interface ListedProfile {
  id: string;
  role: string;
}

/** A login account alone is insufficient: Admin must have added its profile. */
export function isListedUser(userId: string | null | undefined, profile: ListedProfile | null | undefined): boolean {
  return !!userId && profile?.id === userId && ['REQUESTER', 'NARENDRA', 'SANJEEV', 'ADMIN'].includes(profile.role);
}
