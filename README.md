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
