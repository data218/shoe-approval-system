-- ============================================================================
-- PETTY CASH APPROVAL MODULE
-- ============================================================================
-- Adds petty cash requests, approval history, payments, a configurable
-- approval workflow, RLS policies, storage policies and secure SECURITY
-- DEFINER RPCs used by the frontend.
--
-- This migration is ADDITIVE and IDEMPOTENT. It does NOT modify or drop any
-- existing table (shoe_*). Reuses shoe_profiles for identity/roles and
-- shoe_notifications for notifications.
--
-- Roles present in shoe_profiles: ADMIN, REQUESTER, L1_APPROVER,
-- L2_APPROVER, NARENDRA, SANJEEV.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Human readable request number sequence (global, unique)
CREATE SEQUENCE IF NOT EXISTS shoe_petty_cash_request_seq START 1;

-- ============================================================================
-- 1. WORKFLOW SETTINGS (singleton, configurable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shoe_petty_cash_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  management_threshold NUMERIC NOT NULL DEFAULT 10000,
  management_approval_always BOOLEAN NOT NULL DEFAULT FALSE,
  accounts_verification_required BOOLEAN NOT NULL DEFAULT TRUE,
  ea_approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shoe_petty_cash_settings_singleton CHECK (id = 1)
);

INSERT INTO shoe_petty_cash_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. PETTY CASH REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS shoe_petty_cash_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number TEXT UNIQUE NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  branch TEXT,
  employee_id UUID REFERENCES shoe_profiles(id) ON DELETE SET NULL,
  department TEXT,
  expense_category TEXT NOT NULL,
  description TEXT NOT NULL,
  requested_amount NUMERIC NOT NULL CHECK (requested_amount > 0),
  approved_amount NUMERIC CHECK (approved_amount IS NULL OR approved_amount >= 0),
  paid_amount NUMERIC NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING_MANAGER'
    CHECK (status IN (
      'DRAFT','SUBMITTED','PENDING_MANAGER','PENDING_ACCOUNTS','PENDING_EA',
      'PENDING_MANAGEMENT','APPROVED','REJECTED','RETURNED','PAID',
      'PARTIALLY_PAID','SETTLED'
    )),
  current_stage TEXT
    CHECK (current_stage IN ('MANAGER','ACCOUNTS','EA','MANAGEMENT','PAYMENT')),
  requires_management_approval BOOLEAN NOT NULL DEFAULT FALSE,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  remarks TEXT,
  created_by UUID REFERENCES shoe_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoe_petty_cash_requests_status
  ON shoe_petty_cash_requests(status);
CREATE INDEX IF NOT EXISTS idx_shoe_petty_cash_requests_employee
  ON shoe_petty_cash_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_shoe_petty_cash_requests_branch
  ON shoe_petty_cash_requests(branch);
CREATE INDEX IF NOT EXISTS idx_shoe_petty_cash_requests_created_at
  ON shoe_petty_cash_requests(created_at DESC);

-- ============================================================================
-- 3. APPROVAL HISTORY (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shoe_petty_cash_approval_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES shoe_petty_cash_requests(id) ON DELETE CASCADE,
  stage TEXT,
  approver_id UUID REFERENCES shoe_profiles(id) ON DELETE SET NULL,
  approver_name TEXT,
  decision TEXT NOT NULL
    CHECK (decision IN ('SUBMITTED','APPROVED','REJECTED','RETURNED','PAID','SETTLED')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoe_petty_cash_history_request
  ON shoe_petty_cash_approval_history(request_id, created_at);

-- ============================================================================
-- 4. PAYMENTS / SETTLEMENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS shoe_petty_cash_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES shoe_petty_cash_requests(id) ON DELETE CASCADE,
  payment_amount NUMERIC NOT NULL CHECK (payment_amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode TEXT NOT NULL,
  transaction_reference TEXT,
  voucher_number TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'PAID'
    CHECK (settlement_status IN ('PAID','PARTIALLY_PAID','SETTLED')),
  remarks TEXT,
  attachment_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_by UUID REFERENCES shoe_profiles(id) ON DELETE SET NULL,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoe_petty_cash_payments_request
  ON shoe_petty_cash_payments(request_id, created_at);

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Role of the currently authenticated user.
CREATE OR REPLACE FUNCTION shoe_petty_cash_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM shoe_profiles WHERE id = auth.uid();
$$;

-- Whether the supplied role is "management" (can override at any stage).
CREATE OR REPLACE FUNCTION shoe_petty_cash_is_management(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_role, '') IN ('NARENDRA', 'SANJEEV', 'ADMIN');
$$;

-- Whether a role may act at a given stage. Management/Admin may act anywhere.
CREATE OR REPLACE FUNCTION shoe_petty_cash_can_act(p_stage TEXT, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_stage, '')
    WHEN 'MANAGER'    THEN COALESCE(p_role,'') IN ('L1_APPROVER','NARENDRA','SANJEEV','ADMIN')
    WHEN 'ACCOUNTS'   THEN COALESCE(p_role,'') IN ('ADMIN','NARENDRA','SANJEEV')
    WHEN 'EA'         THEN COALESCE(p_role,'') IN ('L2_APPROVER','NARENDRA','SANJEEV','ADMIN')
    WHEN 'MANAGEMENT' THEN COALESCE(p_role,'') IN ('NARENDRA','SANJEEV','ADMIN')
    WHEN 'PAYMENT'    THEN COALESCE(p_role,'') IN ('ADMIN','NARENDRA','SANJEEV')
    ELSE FALSE
  END;
$$;

-- Human readable status for a stage.
CREATE OR REPLACE FUNCTION shoe_petty_cash_status_for_stage(p_stage TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'MANAGER'    THEN 'PENDING_MANAGER'
    WHEN 'ACCOUNTS'   THEN 'PENDING_ACCOUNTS'
    WHEN 'EA'         THEN 'PENDING_EA'
    WHEN 'MANAGEMENT' THEN 'PENDING_MANAGEMENT'
    ELSE 'SUBMITTED'
  END;
$$;

-- Ordered stage sequence for a request (respects settings).
CREATE OR REPLACE FUNCTION shoe_petty_cash_stage_sequence(p_requires_management BOOLEAN)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings shoe_petty_cash_settings%ROWTYPE;
  v_seq TEXT[] := ARRAY['MANAGER'];
BEGIN
  SELECT * INTO v_settings FROM shoe_petty_cash_settings WHERE id = 1;
  IF v_settings.accounts_verification_required THEN
    v_seq := array_append(v_seq, 'ACCOUNTS');
  END IF;
  IF v_settings.ea_approval_required THEN
    v_seq := array_append(v_seq, 'EA');
  END IF;
  IF p_requires_management THEN
    v_seq := array_append(v_seq, 'MANAGEMENT');
  END IF;
  RETURN v_seq;
END;
$$;

-- Insert a notification (reuses shoe_notifications). Pertains to petty cash,
-- so request_id is left NULL because shoe_notifications.request_id is a FK to
-- shoe_requests(id) which does not contain petty cash ids.
CREATE OR REPLACE FUNCTION shoe_petty_cash_notify_roles(p_roles TEXT[], p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO shoe_notifications (user_id, request_id, message, is_read)
    SELECT p.id, NULL, p_message, FALSE
    FROM shoe_profiles p
    WHERE p.role = ANY (p_roles)
      AND p.id <> auth.uid();
  EXCEPTION WHEN OTHERS THEN
    -- Notifications are best-effort; never block the workflow.
    NULL;
  END;
END;
$$;

-- Notify a single user.
CREATE OR REPLACE FUNCTION shoe_petty_cash_notify_user(p_user_id UUID, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO shoe_notifications (user_id, request_id, message, is_read)
    VALUES (p_user_id, NULL, p_message, FALSE);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- ============================================================================
-- 6. SECURE WORKFLOW OPERATIONS (RPCs)
-- ============================================================================

-- Create a new petty cash request for the authenticated user.
CREATE OR REPLACE FUNCTION shoe_petty_cash_create_request(
  p_expense_category TEXT,
  p_description TEXT,
  p_requested_amount NUMERIC,
  p_branch TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL,
  p_request_date DATE DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS shoe_petty_cash_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings shoe_petty_cash_settings%ROWTYPE;
  v_profile shoe_profiles%ROWTYPE;
  v_request shoe_petty_cash_requests%ROWTYPE;
  v_number TEXT;
  v_requires_management BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
    RAISE EXCEPTION 'Requested amount must be greater than zero';
  END IF;
  IF p_expense_category IS NULL OR btrim(p_expense_category) = '' THEN
    RAISE EXCEPTION 'Expense category is required';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Description is required';
  END IF;

  SELECT * INTO v_profile FROM shoe_profiles WHERE id = v_uid;
  SELECT * INTO v_settings FROM shoe_petty_cash_settings WHERE id = 1;

  v_requires_management := v_settings.management_approval_always
    OR (v_settings.management_threshold IS NOT NULL
        AND p_requested_amount > v_settings.management_threshold);

  v_number := 'PC-' || to_char(COALESCE(p_request_date, CURRENT_DATE), 'YYYY')
    || '-' || lpad(nextval('shoe_petty_cash_request_seq')::TEXT, 5, '0');

  INSERT INTO shoe_petty_cash_requests (
    request_number, request_date, branch, employee_id, department,
    expense_category, description, requested_amount, status, current_stage,
    requires_management_approval, attachments, remarks, created_by
  ) VALUES (
    v_number,
    COALESCE(p_request_date, CURRENT_DATE),
    COALESCE(NULLIF(btrim(p_branch), ''), v_profile.showroom_location),
    v_uid,
    COALESCE(NULLIF(btrim(p_department), ''), v_profile.department),
    btrim(p_expense_category),
    btrim(p_description),
    p_requested_amount,
    'PENDING_MANAGER',
    'MANAGER',
    v_requires_management,
    COALESCE(p_attachments, '[]'::jsonb),
    NULLIF(btrim(COALESCE(p_remarks, '')), ''),
    v_uid
  )
  RETURNING * INTO v_request;

  INSERT INTO shoe_petty_cash_approval_history (
    request_id, stage, approver_id, approver_name, decision, remarks
  ) VALUES (
    v_request.id, 'MANAGER', v_uid, v_profile.full_name, 'SUBMITTED', 'Request submitted.'
  );

  PERFORM shoe_petty_cash_notify_roles(
    ARRAY['L1_APPROVER','NARENDRA','SANJEEV','ADMIN'],
    'New petty cash request ' || v_request.request_number || ' is pending manager approval.'
  );

  RETURN v_request;
END;
$$;

-- Approve / reject / return a request at its current stage.
CREATE OR REPLACE FUNCTION shoe_petty_cash_action(
  p_request_id UUID,
  p_action TEXT,
  p_remarks TEXT DEFAULT NULL
)
RETURNS shoe_petty_cash_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := shoe_petty_cash_current_role();
  v_request shoe_petty_cash_requests%ROWTYPE;
  v_seq TEXT[];
  v_idx INT;
  v_next TEXT;
  v_new_status TEXT;
  v_actor_name TEXT;
  v_stage TEXT;
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM shoe_petty_cash_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status NOT IN
     ('PENDING_MANAGER','PENDING_ACCOUNTS','PENDING_EA','PENDING_MANAGEMENT') THEN
    RAISE EXCEPTION 'This request is not awaiting an approval action.';
  END IF;

  -- Cannot approve your own request unless you are an authorised admin.
  IF v_request.employee_id = auth.uid() AND v_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'You cannot action your own request.';
  END IF;

  IF NOT shoe_petty_cash_can_act(v_request.current_stage, v_role) THEN
    RAISE EXCEPTION 'You are not authorised to act at the % stage.', v_request.current_stage;
  END IF;

  v_stage := v_request.current_stage;
  v_actor_name := COALESCE((SELECT full_name FROM shoe_profiles WHERE id = auth.uid()), 'User');

  IF p_action = 'REJECT' THEN
    IF btrim(COALESCE(p_remarks, '')) = '' THEN
      RAISE EXCEPTION 'Remarks are required to reject a request.';
    END IF;
    UPDATE shoe_petty_cash_requests
      SET status = 'REJECTED', current_stage = NULL, updated_at = NOW()
      WHERE id = p_request_id
      RETURNING * INTO v_request;

    INSERT INTO shoe_petty_cash_approval_history
      (request_id, stage, approver_id, approver_name, decision, remarks)
    VALUES (p_request_id, v_stage, auth.uid(), v_actor_name, 'REJECTED', p_remarks);

    PERFORM shoe_petty_cash_notify_user(
      v_request.employee_id,
      'Your petty cash request ' || v_request.request_number || ' was rejected.');

  ELSIF p_action = 'RETURN' THEN
    IF btrim(COALESCE(p_remarks, '')) = '' THEN
      RAISE EXCEPTION 'Remarks are required to return a request.';
    END IF;
    UPDATE shoe_petty_cash_requests
      SET status = 'RETURNED', current_stage = NULL, updated_at = NOW()
      WHERE id = p_request_id
      RETURNING * INTO v_request;

    INSERT INTO shoe_petty_cash_approval_history
      (request_id, stage, approver_id, approver_name, decision, remarks)
    VALUES (p_request_id, v_stage, auth.uid(), v_actor_name, 'RETURNED', p_remarks);

    PERFORM shoe_petty_cash_notify_user(
      v_request.employee_id,
      'Your petty cash request ' || v_request.request_number || ' was returned for correction.');

  ELSIF p_action = 'APPROVE' THEN
    v_seq := shoe_petty_cash_stage_sequence(v_request.requires_management_approval);
    v_idx := array_position(v_seq, v_stage);

    IF v_idx IS NULL OR v_idx >= array_length(v_seq, 1) THEN
      v_next := 'PAYMENT';
    ELSE
      v_next := v_seq[v_idx + 1];
    END IF;

    IF v_next = 'PAYMENT' THEN
      v_new_status := 'APPROVED';
      UPDATE shoe_petty_cash_requests
        SET status = v_new_status,
            current_stage = 'PAYMENT',
            approved_amount = COALESCE(approved_amount, requested_amount),
            updated_at = NOW()
        WHERE id = p_request_id
        RETURNING * INTO v_request;

      PERFORM shoe_petty_cash_notify_roles(
        ARRAY['ADMIN','NARENDRA','SANJEEV'],
        'Petty cash request ' || v_request.request_number || ' is fully approved and pending payment.');
    ELSE
      v_new_status := shoe_petty_cash_status_for_stage(v_next);
      UPDATE shoe_petty_cash_requests
        SET status = v_new_status, current_stage = v_next, updated_at = NOW()
        WHERE id = p_request_id
        RETURNING * INTO v_request;
    END IF;

    INSERT INTO shoe_petty_cash_approval_history
      (request_id, stage, approver_id, approver_name, decision, remarks)
    VALUES (p_request_id, v_stage, auth.uid(), v_actor_name, 'APPROVED',
            NULLIF(btrim(COALESCE(p_remarks, '')), ''));

  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  RETURN v_request;
END;
$$;

-- Requester re-submits a returned request after editing.
CREATE OR REPLACE FUNCTION shoe_petty_cash_resubmit(p_request_id UUID)
RETURNS shoe_petty_cash_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request shoe_petty_cash_requests%ROWTYPE;
  v_profile shoe_profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM shoe_petty_cash_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.employee_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only resubmit your own request.';
  END IF;

  IF v_request.status <> 'RETURNED' THEN
    RAISE EXCEPTION 'Only returned requests can be resubmitted.';
  END IF;

  SELECT * INTO v_profile FROM shoe_profiles WHERE id = auth.uid();

  UPDATE shoe_petty_cash_requests
    SET status = 'PENDING_MANAGER', current_stage = 'MANAGER', updated_at = NOW()
    WHERE id = p_request_id
    RETURNING * INTO v_request;

  INSERT INTO shoe_petty_cash_approval_history
    (request_id, stage, approver_id, approver_name, decision, remarks)
  VALUES (p_request_id, 'MANAGER', auth.uid(), v_profile.full_name, 'SUBMITTED',
          'Request resubmitted after correction.');

  PERFORM shoe_petty_cash_notify_roles(
    ARRAY['L1_APPROVER','NARENDRA','SANJEEV','ADMIN'],
    'Petty cash request ' || v_request.request_number || ' was resubmitted.');

  RETURN v_request;
END;
$$;

-- Record a payment (optionally partial) and update settlement status.
CREATE OR REPLACE FUNCTION shoe_petty_cash_record_payment(
  p_request_id UUID,
  p_payment_amount NUMERIC,
  p_payment_mode TEXT,
  p_payment_date DATE DEFAULT NULL,
  p_transaction_reference TEXT DEFAULT NULL,
  p_voucher_number TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL,
  p_attachment_paths JSONB DEFAULT '[]'::jsonb
)
RETURNS shoe_petty_cash_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := shoe_petty_cash_current_role();
  v_request shoe_petty_cash_requests%ROWTYPE;
  v_profile shoe_profiles%ROWTYPE;
  v_approved NUMERIC;
  v_paid NUMERIC;
  v_new_paid NUMERIC;
  v_status TEXT;
  v_decision TEXT;
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT shoe_petty_cash_can_act('PAYMENT', v_role) THEN
    RAISE EXCEPTION 'You are not authorised to record payments.';
  END IF;

  IF p_payment_amount IS NULL OR p_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  SELECT * INTO v_request FROM shoe_petty_cash_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status NOT IN ('APPROVED','PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Payments can only be recorded for approved requests.';
  END IF;

  v_approved := COALESCE(v_request.approved_amount, v_request.requested_amount);
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_paid
    FROM shoe_petty_cash_payments WHERE request_id = p_request_id;

  IF (v_paid + p_payment_amount) > (v_approved + 0.001) THEN
    RAISE EXCEPTION 'Payment exceeds the approved amount (outstanding %).', (v_approved - v_paid);
  END IF;

  SELECT * INTO v_profile FROM shoe_profiles WHERE id = auth.uid();

  v_new_paid := v_paid + p_payment_amount;
  IF v_new_paid >= (v_approved - 0.001) THEN
    v_status := 'SETTLED';
    v_decision := 'SETTLED';
  ELSE
    v_status := 'PARTIALLY_PAID';
    v_decision := 'PAID';
  END IF;

  INSERT INTO shoe_petty_cash_payments (
    request_id, payment_amount, payment_date, payment_mode, transaction_reference,
    voucher_number, settlement_status, remarks, attachment_paths, recorded_by,
    recorded_by_name
  ) VALUES (
    p_request_id, p_payment_amount, COALESCE(p_payment_date, CURRENT_DATE),
    p_payment_mode, NULLIF(btrim(COALESCE(p_transaction_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_voucher_number, '')), ''), v_status,
    NULLIF(btrim(COALESCE(p_remarks, '')), ''), COALESCE(p_attachment_paths, '[]'::jsonb),
    auth.uid(), COALESCE(v_profile.full_name, 'User')
  );

  UPDATE shoe_petty_cash_requests
    SET paid_amount = v_new_paid, status = v_status, updated_at = NOW()
    WHERE id = p_request_id
    RETURNING * INTO v_request;

  INSERT INTO shoe_petty_cash_approval_history
    (request_id, stage, approver_id, approver_name, decision, remarks)
  VALUES (p_request_id, 'PAYMENT', auth.uid(), COALESCE(v_profile.full_name, 'User'),
          v_decision, NULLIF(btrim(COALESCE(p_remarks, '')), ''));

  PERFORM shoe_petty_cash_notify_user(
    v_request.employee_id,
    'A payment of ' || p_payment_amount || ' was recorded for ' || v_request.request_number || '.');

  RETURN v_request;
END;
$$;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE shoe_petty_cash_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoe_petty_cash_approval_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoe_petty_cash_payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoe_petty_cash_settings          ENABLE ROW LEVEL SECURITY;

-- Requests: owner sees own; approvers/management/admin see all.
DROP POLICY IF EXISTS "shoe_petty_cash_requests_select" ON shoe_petty_cash_requests;
CREATE POLICY "shoe_petty_cash_requests_select" ON shoe_petty_cash_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR shoe_petty_cash_current_role() IN ('L1_APPROVER','L2_APPROVER','ADMIN','NARENDRA','SANJEEV')
  );

-- Requesters may create their own requests (workflow RPC is preferred).
DROP POLICY IF EXISTS "shoe_petty_cash_requests_insert" ON shoe_petty_cash_requests;
CREATE POLICY "shoe_petty_cash_requests_insert" ON shoe_petty_cash_requests
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() AND created_by = auth.uid());

-- Owners may edit only returned/draft requests; admins may edit any.
DROP POLICY IF EXISTS "shoe_petty_cash_requests_update" ON shoe_petty_cash_requests;
CREATE POLICY "shoe_petty_cash_requests_update" ON shoe_petty_cash_requests
  FOR UPDATE TO authenticated
  USING (
    (employee_id = auth.uid() AND status IN ('RETURNED','DRAFT'))
    OR shoe_petty_cash_current_role() = 'ADMIN'
  )
  WITH CHECK (
    (employee_id = auth.uid() AND status IN ('RETURNED','DRAFT'))
    OR shoe_petty_cash_current_role() = 'ADMIN'
  );

-- Only admins may delete requests.
DROP POLICY IF EXISTS "shoe_petty_cash_requests_delete" ON shoe_petty_cash_requests;
CREATE POLICY "shoe_petty_cash_requests_delete" ON shoe_petty_cash_requests
  FOR DELETE TO authenticated
  USING (shoe_petty_cash_current_role() = 'ADMIN');

-- History: readable by anyone who can see the parent request. No write
-- policies -> rows can only be written by SECURITY DEFINER functions, and can
-- never be updated or deleted (append-only).
DROP POLICY IF EXISTS "shoe_petty_cash_history_select" ON shoe_petty_cash_approval_history;
CREATE POLICY "shoe_petty_cash_history_select" ON shoe_petty_cash_approval_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shoe_petty_cash_requests r
      WHERE r.id = shoe_petty_cash_approval_history.request_id
        AND (
          r.employee_id = auth.uid()
          OR shoe_petty_cash_current_role() IN ('L1_APPROVER','L2_APPROVER','ADMIN','NARENDRA','SANJEEV')
        )
    )
  );

-- Payments: readable by anyone who can see the parent request. Writes only
-- via SECURITY DEFINER function (shoe_petty_cash_record_payment).
DROP POLICY IF EXISTS "shoe_petty_cash_payments_select" ON shoe_petty_cash_payments;
CREATE POLICY "shoe_petty_cash_payments_select" ON shoe_petty_cash_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shoe_petty_cash_requests r
      WHERE r.id = shoe_petty_cash_payments.request_id
        AND (
          r.employee_id = auth.uid()
          OR shoe_petty_cash_current_role() IN ('L1_APPROVER','L2_APPROVER','ADMIN','NARENDRA','SANJEEV')
        )
    )
  );

-- Settings: everyone can read, only admins can change.
DROP POLICY IF EXISTS "shoe_petty_cash_settings_select" ON shoe_petty_cash_settings;
CREATE POLICY "shoe_petty_cash_settings_select" ON shoe_petty_cash_settings
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "shoe_petty_cash_settings_update" ON shoe_petty_cash_settings;
CREATE POLICY "shoe_petty_cash_settings_update" ON shoe_petty_cash_settings
  FOR UPDATE TO authenticated
  USING (shoe_petty_cash_current_role() = 'ADMIN')
  WITH CHECK (shoe_petty_cash_current_role() = 'ADMIN');

-- ============================================================================
-- 8. GRANTS
-- ============================================================================
GRANT SELECT ON shoe_petty_cash_requests, shoe_petty_cash_approval_history,
  shoe_petty_cash_payments, shoe_petty_cash_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON shoe_petty_cash_requests TO authenticated;
GRANT INSERT, UPDATE ON shoe_petty_cash_settings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE shoe_petty_cash_request_seq TO authenticated;

GRANT EXECUTE ON FUNCTION shoe_petty_cash_create_request(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION shoe_petty_cash_action(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION shoe_petty_cash_resubmit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION shoe_petty_cash_record_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION shoe_petty_cash_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION shoe_petty_cash_stage_sequence(BOOLEAN) TO authenticated;

-- ============================================================================
-- 9. STORAGE (private bucket + policies)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('shoe-petty-cash-receipts', 'shoe-petty-cash-receipts', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "shoe_petty_cash_receipts_insert" ON storage.objects;
CREATE POLICY "shoe_petty_cash_receipts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shoe-petty-cash-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "shoe_petty_cash_receipts_select" ON storage.objects;
CREATE POLICY "shoe_petty_cash_receipts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'shoe-petty-cash-receipts');

DROP POLICY IF EXISTS "shoe_petty_cash_receipts_delete" ON storage.objects;
CREATE POLICY "shoe_petty_cash_receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'shoe-petty-cash-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR shoe_petty_cash_current_role() = 'ADMIN'
    )
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
