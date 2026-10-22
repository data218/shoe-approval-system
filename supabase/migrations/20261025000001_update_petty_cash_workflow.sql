-- ==============================================
-- 20261025000001_update_petty_cash_workflow.sql
-- ==============================================
-- Remove MANAGEMENT stage from the petty cash approval workflow.
-- Adjust CHECK constraints, stage sequence function, can_act function,
-- and status_for_stage function to reflect the simplified flow:
-- Requestor → L1 Approver (MANAGER) → L2 Approver (EA) → Accounts (PAYMENT)

-- 1. Update status CHECK constraint (remove PENDING_MANAGEMENT)
ALTER TABLE shoe_petty_cash_requests
  DROP CONSTRAINT IF EXISTS shoe_petty_cash_requests_status_check,
  ADD CONSTRAINT shoe_petty_cash_requests_status_check CHECK (
    status IN (
      'DRAFT','SUBMITTED','PENDING_MANAGER','PENDING_ACCOUNTS','PENDING_EA',
      'APPROVED','REJECTED','RETURNED','PAID','PARTIALLY_PAID','SETTLED'
    )
  );

-- 2. Update current_stage CHECK constraint (remove MANAGEMENT)
ALTER TABLE shoe_petty_cash_requests
  DROP CONSTRAINT IF EXISTS shoe_petty_cash_requests_current_stage_check,
  ADD CONSTRAINT shoe_petty_cash_requests_current_stage_check CHECK (
    current_stage IN ('MANAGER','ACCOUNTS','EA','PAYMENT')
  );

-- 3. Replace can_act function (drop MANAGEMENT case)
CREATE OR REPLACE FUNCTION shoe_petty_cash_can_act(p_stage TEXT, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_stage, '')
    WHEN 'MANAGER'    THEN COALESCE(p_role,'') IN ('L1_APPROVER','NARENDRA','SANJEEV','ADMIN')
    WHEN 'ACCOUNTS'   THEN COALESCE(p_role,'') IN ('ADMIN','NARENDRA','SANJEEV')
    WHEN 'EA'         THEN COALESCE(p_role,'') IN ('L2_APPROVER','NARENDRA','SANJEEV','ADMIN')
    WHEN 'PAYMENT'    THEN COALESCE(p_role,'') IN ('ADMIN','NARENDRA','SANJEEV')
    ELSE FALSE
  END;
$$;

-- 4. Replace status_for_stage function (drop MANAGEMENT case)
CREATE OR REPLACE FUNCTION shoe_petty_cash_status_for_stage(p_stage TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'MANAGER'    THEN 'PENDING_MANAGER'
    WHEN 'ACCOUNTS'   THEN 'PENDING_ACCOUNTS'
    WHEN 'EA'         THEN 'PENDING_EA'
    ELSE 'SUBMITTED'
  END;
$$;

-- 5. Replace stage_sequence function (ignore management flag)
CREATE OR REPLACE FUNCTION shoe_petty_cash_stage_sequence(p_requires_management BOOLEAN)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq TEXT[] := ARRAY['MANAGER'];
BEGIN
  -- Accounts verification based on settings
  IF (SELECT accounts_verification_required FROM shoe_petty_cash_settings WHERE id = 1) THEN
    v_seq := array_append(v_seq, 'ACCOUNTS');
  END IF;
  -- EA approval based on settings
  IF (SELECT ea_approval_required FROM shoe_petty_cash_settings WHERE id = 1) THEN
    v_seq := array_append(v_seq, 'EA');
  END IF;
  -- Management stage is deliberately omitted in the simplified workflow
  RETURN v_seq;
END;
$$;

-- 6. Update create request function to set status/current_stage consistently
CREATE OR REPLACE FUNCTION shoe_petty_cash_create_request(
  p_expense_category TEXT,
  p_description TEXT,
  p_requested_amount NUMERIC,
  p_branch TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL,
  p_request_date DATE DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::jsonb
) RETURNS shoe_petty_cash_requests
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
    OR (v_settings.management_threshold IS NOT NULL AND p_requested_amount > v_settings.management_threshold);

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
  ) RETURNING * INTO v_request;

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

-- ==============================================
-- End of migration
-- ==============================================
