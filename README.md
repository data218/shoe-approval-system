# Oh Shoes approval system

React, TypeScript and Vite frontend backed by Supabase Auth, PostgreSQL, Storage and Realtime.

## Approval workflow

Every signed-in employee with a profile can submit purchase, customer discount and petty cash requests. Every request goes directly to **management** and requires **one approval**.

- **Requester:** submit requests and view their own requests, decisions and receipts.
- **Management (`NARENDRA`, `SANJEEV`):** submit requests, view all requests, approve or reject other employees' requests, and record petty cash payments.
- **Admin (`ADMIN`):** full application access, including user creation/removal, profile and role management, all requests, approvals, catalogue and data management. Admin may approve their own request. Administrators cannot delete their own login through User Management.

Purchase and discount: `PENDING_MANAGEMENT → FINAL_APPROVED / REJECTED`.

Petty cash: `PENDING_MANAGEMENT → APPROVED → PARTIALLY_PAID / SETTLED`. Management can return a request for correction; its owner can edit and resubmit it directly to management. Payment recording documents an external payment; it does not transfer money or introduce another approval stage.

## Development

Use Node.js 24 LTS and npm. Work in the existing checkout.

```bash
npm ci
npm run dev
npm run build
npm run lint
npm run test:approval
```

Vite reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from local environment configuration. Never use a service-role key in a `VITE_*` variable. Password reset redirect URLs must be allowed in Supabase Auth configuration.

## Database update

Apply `supabase/migrations/20261026000000_single_management_approval.sql` to the established Supabase `shoe_*` schema before deploying this frontend. The frontend requires its new `shoe_create_request`, `shoe_request_action` and `shoe_admin_delete_user` RPCs.

The migration:

- Routes existing pending purchase/discount/petty cash requests to management. Existing purchase/discount send-backs are reopened for management review.
- Converts obsolete L1/L2/Accounts approval roles to `REQUESTER`; retains Admin, Narendra and Sanjeev as management. An Admin can assign management access through User Management.
- Preserves final decisions, request details, approval history and recorded payments.
- Enforces requester ownership and management-only decisions in PostgreSQL, with atomic submission, server-calculated totals, sequential IDs, row locking and atomic audit writes.
- Removes the Auth account and employee profile when an Admin removes a user; existing business records remain with nullable user references.

The oldest migration describes an earlier, unprefixed schema and contains destructive `DROP TABLE` statements. It is not a fresh-install script for the current application. Do not rerun it on an existing production database. The new migration expects the existing `shoe_*` tables, functions and storage setup from the prior migrations.

## Workflow tests

`npm run test:approval` runs isolated PostgreSQL tests using PGlite. It constructs a fixture of the established base schema, loads the historical petty cash/admin migrations, applies the new migration, and exercises submission, role restrictions, single-step approvals, return/resubmission, payment limits, user administration and legacy-data conversion. It never connects to or changes a hosted Supabase project. Passing local tests does not establish that a hosted migration has been applied.

## User directory emails

User Management displays and searches profile emails. Apply `supabase/migrations/20261027000000_sync_profile_emails.sql` once to backfill missing or placeholder addresses from Supabase Auth and keep profile emails synchronized with login changes. The frontend also saves the login email when creating users against older databases. This migration changes no passwords or approval permissions.

## Full user editing

Apply `supabase/migrations/20261028000000_admin_edit_user.sql` to enable Admin edits of login email and optional password alongside name, employee code, department, branch and role. It also backfills profile emails from Auth. The RPC checks Admin access and updates Auth, the email identity and the employee profile atomically. Blank passwords keep the existing password; existing passwords are never retrieved by the editor. Until installed, ordinary profile/role editing remains available, while email/password changes show an explicit unavailable message.

## Listed users only

The app verifies the Auth user ID against the Admin-managed `shoe_profiles` list before opening protected pages. It never automatically creates employee profiles. Apply `supabase/migrations/20261030000000_restrict_access_to_listed_users.sql` for server enforcement: unlisted login accounts are blocked, self-enrolment is denied, data/storage access requires list membership, and profile removal revokes refresh sessions. Admin user creation remains supported; provisioning the employee profile permits the new account to sign in. The frontend rechecks membership on focus and every 20 seconds while active. Existing access tokens may remain cryptographically valid until expiry, but the database membership policies deny their application data access immediately after removal.

## Passwords and recovery

Every listed user can open **My Account → Change Password**. The current password is verified through an isolated, non-persisting Auth client before updating the signed-in user's own password. The user returns to sign-in after success. No password values are logged or stored in profile data.

Forgot Password requests a Supabase Auth recovery email and returns to `/update-password`; that production URL must be allowed in Supabase Auth URL Configuration. Expired links show an explicit error. Admin reset links use the selected user's saved login email. Automated tests use fake Auth clients and do not send email or change live passwords; email delivery must be confirmed separately with an authorized recipient.
