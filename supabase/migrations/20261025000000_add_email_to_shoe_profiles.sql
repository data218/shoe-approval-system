-- Migration to add email column to shoe_profiles table
-- Generated on 2026-10-22

BEGIN;

ALTER TABLE shoe_profiles
  ADD COLUMN email TEXT;

-- Optional: set placeholder emails for existing roles (adjust as needed)
UPDATE shoe_profiles SET email = 'l1_approver@example.com' WHERE role = 'L1_APPROVER';
UPDATE shoe_profiles SET email = 'l2_approver@example.com' WHERE role = 'L2_APPROVER';
UPDATE shoe_profiles SET email = 'account_approver@example.com' WHERE role = 'ACCOUNT_APPROVER';
UPDATE shoe_profiles SET email = 'management_approver@example.com' WHERE role = 'MANAGEMENT_APPROVER';
UPDATE shoe_profiles SET email = 'payment_approver@example.com' WHERE role = 'PAYMENT_APPROVER';

COMMIT;
