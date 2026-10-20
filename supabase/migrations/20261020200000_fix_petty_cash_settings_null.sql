-- ============================================================================
-- FIX: "null value in column requires_management_approval ... not-null constraint"
-- ============================================================================
-- Two causes seen in production:
--   1. shoe_petty_cash_settings has no id=1 row, so
--      v_settings.management_approval_always is NULL and the computed
--      v_requires_management becomes NULL -> INSERT fails NOT NULL.
--   2. The live column has no DEFAULT, so any INSERT that omits it fails.
-- This migration is idempotent and self-healing.

-- A. Guarantee the singleton settings row exists.
INSERT INTO shoe_petty_cash_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- B. Guarantee the column is non-nullable with a default.
ALTER TABLE shoe_petty_cash_requests
  ALTER COLUMN requires_management_approval SET DEFAULT FALSE;

UPDATE shoe_petty_cash_requests
  SET requires_management_approval = FALSE
  WHERE requires_management_approval IS NULL;

ALTER TABLE shoe_petty_cash_requests
  ALTER COLUMN requires_management_approval SET NOT NULL;

-- C. Null-safe stage sequence.
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
  IF COALESCE(v_settings.accounts_verification_required, TRUE) THEN
    v_seq := array_append(v_seq, 'ACCOUNTS');
  END IF;
  IF COALESCE(v_settings.ea_approval_required, TRUE) THEN
    v_seq := array_append(v_seq, 'EA');
  END IF;
  IF COALESCE(p_requires_management, FALSE) THEN
    v_seq := array_append(v_seq, 'MANAGEMENT');
  END IF;
  RETURN v_seq;
END;
$$;

-- D. Create request: self-heal the settings row and null-safe computation.
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

  -- Self-heal: the singleton settings row must exist.
  INSERT INTO shoe_petty_cash_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_profile FROM shoe_profiles WHERE id = v_uid;
  SELECT * INTO v_settings FROM shoe_petty_cash_settings WHERE id = 1;

  v_requires_management := COALESCE(v_settings.management_approval_always, FALSE)
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
    COALESCE(v_requires_management, FALSE),
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

-- E. Grants
GRANT EXECUTE ON FUNCTION shoe_petty_cash_stage_sequence(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION shoe_petty_cash_create_request(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, JSONB) TO authenticated;
