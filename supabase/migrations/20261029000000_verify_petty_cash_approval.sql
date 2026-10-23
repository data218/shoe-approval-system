-- Require approval evidence before payment; repair the reported unpaid legacy request only.
BEGIN;
-- Make history/payment visibility follow the parent request's access policy.
GRANT SELECT ON shoe_petty_cash_approval_history, shoe_petty_cash_payments TO authenticated;
DROP POLICY IF EXISTS shoe_petty_cash_history_select ON shoe_petty_cash_approval_history;
CREATE POLICY shoe_petty_cash_history_select ON shoe_petty_cash_approval_history
  FOR SELECT TO authenticated USING (EXISTS(
    SELECT 1 FROM shoe_petty_cash_requests r WHERE r.id = request_id
  ));
DROP POLICY IF EXISTS shoe_petty_cash_payments_select ON shoe_petty_cash_payments;
CREATE POLICY shoe_petty_cash_payments_select ON shoe_petty_cash_payments
  FOR SELECT TO authenticated USING (EXISTS(
    SELECT 1 FROM shoe_petty_cash_requests r WHERE r.id = request_id
  ));

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

  IF NOT EXISTS (
    SELECT 1 FROM shoe_petty_cash_approval_history h
    WHERE h.request_id = p_request_id AND h.decision = 'APPROVED'
      AND h.created_at >= COALESCE((SELECT MAX(s.created_at)
        FROM shoe_petty_cash_approval_history s
        WHERE s.request_id = p_request_id AND s.decision = 'SUBMITTED'), '-infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'A recorded management approval is required before payment.';
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

-- Lock and requeue PC-2026-00030 only when it has no approval or payment record.
DO $$
DECLARE r shoe_petty_cash_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM shoe_petty_cash_requests WHERE request_number = 'PC-2026-00030' FOR UPDATE;
  IF FOUND AND r.status = 'APPROVED' AND r.paid_amount = 0
    AND NOT EXISTS(SELECT 1 FROM shoe_petty_cash_payments WHERE request_id = r.id)
    AND NOT EXISTS(SELECT 1 FROM shoe_petty_cash_approval_history WHERE request_id = r.id AND decision = 'APPROVED') THEN
    UPDATE shoe_petty_cash_requests SET status = 'PENDING_MANAGEMENT', current_stage = 'MANAGEMENT',
      approved_amount = NULL, requires_management_approval = TRUE, updated_at = NOW() WHERE id = r.id;
    INSERT INTO shoe_petty_cash_approval_history(request_id,stage,approver_name,decision,remarks)
      VALUES(r.id,'MANAGEMENT','System correction','SUBMITTED',
        'Requeued for management review: legacy approved status had no recorded approval or payment.');
  END IF;
END $$;
COMMIT;

SELECT request_number,status,current_stage,approved_amount,paid_amount
FROM shoe_petty_cash_requests WHERE request_number = 'PC-2026-00030';
