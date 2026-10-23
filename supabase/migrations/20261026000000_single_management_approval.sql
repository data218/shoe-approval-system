-- One management approval for purchase, discount and petty cash.
-- Apply after the existing migrations to an established shoe_* schema.
-- Existing final decisions/payment history are preserved. Legacy approver and
-- Accounts users become requesters; ADMIN/NARENDRA/SANJEEV remain management.
BEGIN;

CREATE OR REPLACE FUNCTION public.shoe_is_management()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM shoe_profiles WHERE id = auth.uid()
  AND role IN ('ADMIN','NARENDRA','SANJEEV')); $$;

CREATE OR REPLACE FUNCTION public.shoe_is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM shoe_profiles WHERE id = auth.uid() AND role = 'ADMIN'); $$;

-- Remove old role/status constraints before converting in-flight requests.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'c' AND (
      (conrelid = 'public.shoe_profiles'::regclass AND pg_get_constraintdef(oid) ~ '\mrole\M') OR
      (conrelid = 'public.shoe_requests'::regclass AND pg_get_constraintdef(oid) ~ '\mstatus\M') OR
      (conrelid = 'public.shoe_petty_cash_requests'::regclass AND
       pg_get_constraintdef(oid) ~ '\m(status|current_stage)\M'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

UPDATE shoe_profiles SET role = 'REQUESTER'
WHERE role IN ('L1_APPROVER','L2_APPROVER','ACCOUNT','ACCOUNT_APPROVER',
               'MANAGEMENT_APPROVER','PAYMENT_APPROVER');
ALTER TABLE shoe_profiles ADD CONSTRAINT shoe_profiles_role_check
  CHECK (role IN ('ADMIN','REQUESTER','NARENDRA','SANJEEV'));

UPDATE shoe_requests SET status = 'PENDING_MANAGEMENT', updated_at = NOW()
WHERE status IN ('PENDING_L1','PENDING_L2','PENDING_NARENDRA','PENDING_SANJEEV','SENT_BACK');
ALTER TABLE shoe_requests ALTER COLUMN status SET DEFAULT 'PENDING_MANAGEMENT';
ALTER TABLE shoe_requests ADD CONSTRAINT shoe_requests_status_check
  CHECK (status IN ('PENDING_MANAGEMENT','FINAL_APPROVED','REJECTED','SENT_BACK'));

UPDATE shoe_petty_cash_requests
SET status = 'PENDING_MANAGEMENT', current_stage = 'MANAGEMENT',
    requires_management_approval = TRUE, updated_at = NOW()
WHERE status IN ('SUBMITTED','PENDING_MANAGER','PENDING_ACCOUNTS','PENDING_EA','PENDING_MANAGEMENT');
ALTER TABLE shoe_petty_cash_requests ALTER COLUMN status SET DEFAULT 'PENDING_MANAGEMENT';
ALTER TABLE shoe_petty_cash_requests ALTER COLUMN current_stage SET DEFAULT 'MANAGEMENT';
ALTER TABLE shoe_petty_cash_requests ALTER COLUMN requires_management_approval SET DEFAULT TRUE;
ALTER TABLE shoe_petty_cash_requests ADD CONSTRAINT shoe_petty_cash_requests_status_check
  CHECK (status IN ('DRAFT','PENDING_MANAGEMENT','APPROVED','REJECTED','RETURNED','PAID','PARTIALLY_PAID','SETTLED'));
ALTER TABLE shoe_petty_cash_requests ADD CONSTRAINT shoe_petty_cash_requests_current_stage_check
  CHECK (current_stage IN ('MANAGEMENT','PAYMENT'));

INSERT INTO shoe_petty_cash_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
UPDATE shoe_petty_cash_settings SET management_approval_always = TRUE,
  accounts_verification_required = FALSE, ea_approval_required = FALSE WHERE id = 1;

CREATE OR REPLACE FUNCTION shoe_petty_cash_can_act(p_stage TEXT, p_role TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_stage,'') IN ('MANAGEMENT','PAYMENT')
     AND COALESCE(p_role,'') IN ('ADMIN','NARENDRA','SANJEEV');
$$;
CREATE OR REPLACE FUNCTION shoe_petty_cash_status_for_stage(p_stage TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_stage = 'MANAGEMENT' THEN 'PENDING_MANAGEMENT' ELSE 'APPROVED' END;
$$;
CREATE OR REPLACE FUNCTION shoe_petty_cash_stage_sequence(p_requires_management BOOLEAN)
RETURNS TEXT[] LANGUAGE sql STABLE AS $$ SELECT ARRAY['MANAGEMENT']::TEXT[]; $$;

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
  v_serial BIGINT;
  v_requires_management BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 OR p_requested_amount::TEXT IN ('NaN','Infinity','-Infinity') THEN
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

  v_requires_management := TRUE;

  v_serial := nextval('shoe_petty_cash_request_seq');
  v_number := 'PC-' || to_char(COALESCE(p_request_date, CURRENT_DATE), 'YYYY')
    || '-' || lpad(v_serial::TEXT, GREATEST(5,length(v_serial::TEXT)), '0');

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
    'PENDING_MANAGEMENT',
    'MANAGEMENT',
    COALESCE(v_requires_management, FALSE),
    COALESCE(p_attachments, '[]'::jsonb),
    NULLIF(btrim(COALESCE(p_remarks, '')), ''),
    v_uid
  )
  RETURNING * INTO v_request;

  INSERT INTO shoe_petty_cash_approval_history (
    request_id, stage, approver_id, approver_name, decision, remarks
  ) VALUES (
    v_request.id, 'MANAGEMENT', v_uid, v_profile.full_name, 'SUBMITTED', 'Request submitted.'
  );

  PERFORM shoe_petty_cash_notify_roles(
    ARRAY['NARENDRA','SANJEEV','ADMIN'],
    'New petty cash request ' || v_request.request_number || ' is pending management approval.'
  );

  RETURN v_request;
END;
$$;

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

  IF v_request.status <> 'PENDING_MANAGEMENT' OR v_request.current_stage <> 'MANAGEMENT' THEN
    RAISE EXCEPTION 'This request is not awaiting management approval.';
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
    SET status = 'PENDING_MANAGEMENT', current_stage = 'MANAGEMENT', updated_at = NOW()
    WHERE id = p_request_id
    RETURNING * INTO v_request;

  INSERT INTO shoe_petty_cash_approval_history
    (request_id, stage, approver_id, approver_name, decision, remarks)
  VALUES (p_request_id, 'MANAGEMENT', auth.uid(), v_profile.full_name, 'SUBMITTED',
          'Request resubmitted after correction.');

  PERFORM shoe_petty_cash_notify_roles(
    ARRAY['NARENDRA','SANJEEV','ADMIN'],
    'Petty cash request ' || v_request.request_number || ' was resubmitted.');

  RETURN v_request;
END;
$$;

-- Atomic management decision, including its audit row. Row locking prevents
-- two reviewers from overwriting each other's completed decisions.
CREATE OR REPLACE FUNCTION public.shoe_request_action(
  p_request_id UUID, p_action TEXT, p_remarks TEXT DEFAULT NULL
) RETURNS shoe_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_request shoe_requests%ROWTYPE; v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT shoe_is_management() THEN
    RAISE EXCEPTION 'Only management can action requests';
  END IF;
  SELECT * INTO v_request FROM shoe_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_request.status <> 'PENDING_MANAGEMENT' THEN
    RAISE EXCEPTION 'Request is not awaiting management approval';
  END IF;
  IF v_request.requester_id = auth.uid() AND NOT shoe_is_admin() THEN
    RAISE EXCEPTION 'You cannot action your own request';
  END IF;
  IF p_action = 'APPROVE' THEN v_status := 'FINAL_APPROVED';
  ELSIF p_action = 'REJECT' THEN
    IF btrim(COALESCE(p_remarks,'')) = '' THEN RAISE EXCEPTION 'Rejection remarks are required'; END IF;
    v_status := 'REJECTED';
  ELSE RAISE EXCEPTION 'Invalid action'; END IF;
  UPDATE shoe_requests SET status = v_status, updated_at = NOW()
    WHERE id = p_request_id RETURNING * INTO v_request;
  INSERT INTO shoe_audit_logs (request_id, user_id, action, previous_status, new_status, remarks)
    VALUES (p_request_id, auth.uid(), p_action, 'PENDING_MANAGEMENT', v_status, p_remarks);
  IF v_request.requester_id IS NOT NULL AND v_request.requester_id <> auth.uid() THEN
    INSERT INTO shoe_notifications(user_id,request_id,message,is_read)
      VALUES(v_request.requester_id,v_request.id,'Your request ' || v_request.display_id ||
        CASE WHEN p_action = 'APPROVE' THEN ' was approved by management.' ELSE ' was rejected by management.' END,FALSE);
  END IF;
  RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.shoe_request_action(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_request_action(UUID,TEXT,TEXT) TO authenticated;

-- Replace legacy permissive policies. Direct final decisions cannot bypass RPCs.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('shoe_requests','shoe_petty_cash_requests','shoe_profiles')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
ALTER TABLE shoe_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoe_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoe_petty_cash_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY shoe_profiles_read ON shoe_profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY shoe_profiles_insert ON shoe_profiles FOR INSERT TO authenticated
  WITH CHECK (shoe_is_admin() OR (id = auth.uid() AND role = 'REQUESTER'));
CREATE POLICY shoe_profiles_update ON shoe_profiles FOR UPDATE TO authenticated
  USING (shoe_is_admin()) WITH CHECK (shoe_is_admin());
CREATE POLICY shoe_profiles_delete ON shoe_profiles FOR DELETE TO authenticated USING (shoe_is_admin());
CREATE POLICY shoe_requests_read ON shoe_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR shoe_is_management());
CREATE POLICY shoe_requests_insert ON shoe_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND status = 'PENDING_MANAGEMENT');
CREATE POLICY shoe_requests_admin_update ON shoe_requests FOR UPDATE TO authenticated
  USING (shoe_is_admin()) WITH CHECK (shoe_is_admin());
CREATE POLICY shoe_requests_delete ON shoe_requests FOR DELETE TO authenticated USING (shoe_is_admin());

CREATE POLICY shoe_petty_cash_requests_read ON shoe_petty_cash_requests FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR shoe_is_management());
-- Creation must go through its RPC: no direct insert policy.
CREATE POLICY shoe_petty_cash_requests_edit ON shoe_petty_cash_requests FOR UPDATE TO authenticated
  USING (shoe_is_admin() OR (employee_id = auth.uid() AND status IN ('RETURNED','DRAFT')))
  WITH CHECK (shoe_is_admin() OR (employee_id = auth.uid() AND status IN ('RETURNED','DRAFT')));
CREATE POLICY shoe_petty_cash_requests_delete ON shoe_petty_cash_requests FOR DELETE TO authenticated
  USING (shoe_is_admin());

-- Returned-request editing must not alter approval/payment/ownership fields.
CREATE OR REPLACE FUNCTION public.shoe_petty_cash_guard_edit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT shoe_is_admin() AND
    (NEW.id IS DISTINCT FROM OLD.id OR NEW.employee_id IS DISTINCT FROM OLD.employee_id OR
     NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.status IS DISTINCT FROM OLD.status OR
     NEW.current_stage IS DISTINCT FROM OLD.current_stage OR NEW.approved_amount IS DISTINCT FROM OLD.approved_amount OR
     NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
     NEW.requires_management_approval IS DISTINCT FROM OLD.requires_management_approval OR
     NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Approval and payment fields can only be changed through the workflow';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shoe_petty_cash_guard_edit ON shoe_petty_cash_requests;
CREATE TRIGGER shoe_petty_cash_guard_edit BEFORE UPDATE ON shoe_petty_cash_requests
  FOR EACH ROW EXECUTE FUNCTION public.shoe_petty_cash_guard_edit();

-- An administrator removes the actual Auth account as well as its profile.
-- Keep financial/audit records, removing their reference to the deleted user.
CREATE OR REPLACE FUNCTION public.shoe_admin_delete_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT shoe_is_admin() THEN RAISE EXCEPTION 'Only administrators can remove users'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot remove your own administrator account'; END IF;
  UPDATE shoe_requests SET requester_id = NULL WHERE requester_id = p_user_id;
  UPDATE shoe_audit_logs SET user_id = NULL WHERE user_id = p_user_id;
  DELETE FROM shoe_notifications WHERE user_id = p_user_id;
  DELETE FROM shoe_profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.shoe_admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_admin_delete_user(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.shoe_is_management() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shoe_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_is_management(), public.shoe_is_admin() TO authenticated;

-- Submitted line items and audit history are immutable to requesters. Otherwise
-- a requester could change the amount after management has approved it.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('shoe_purchase_details','shoe_discount_details','shoe_audit_logs')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
CREATE POLICY shoe_purchase_details_read ON shoe_purchase_details FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM shoe_requests r WHERE r.id = request_id));
CREATE POLICY shoe_purchase_details_admin ON shoe_purchase_details FOR ALL TO authenticated
  USING (shoe_is_admin()) WITH CHECK (shoe_is_admin());
CREATE POLICY shoe_discount_details_read ON shoe_discount_details FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM shoe_requests r WHERE r.id = request_id));
CREATE POLICY shoe_discount_details_admin ON shoe_discount_details FOR ALL TO authenticated
  USING (shoe_is_admin()) WITH CHECK (shoe_is_admin());
CREATE POLICY shoe_audit_logs_read ON shoe_audit_logs FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM shoe_requests r WHERE r.id = request_id));
CREATE POLICY shoe_audit_logs_admin ON shoe_audit_logs FOR ALL TO authenticated
  USING (shoe_is_admin()) WITH CHECK (shoe_is_admin());

-- Database-generated IDs and transactional submission prevent partial requests.
CREATE SEQUENCE IF NOT EXISTS shoe_purchase_request_seq;
CREATE SEQUENCE IF NOT EXISTS shoe_discount_request_seq;
SELECT setval('shoe_purchase_request_seq', GREATEST(COALESCE((
  SELECT MAX(substring(display_id FROM '[0-9]+$')::BIGINT) FROM shoe_requests WHERE type = 'PURCHASE'
),0),1), EXISTS(SELECT 1 FROM shoe_requests WHERE type = 'PURCHASE'));
SELECT setval('shoe_discount_request_seq', GREATEST(COALESCE((
  SELECT MAX(substring(display_id FROM '[0-9]+$')::BIGINT) FROM shoe_requests WHERE type = 'DISCOUNT'
),0),1), EXISTS(SELECT 1 FROM shoe_requests WHERE type = 'DISCOUNT'));

CREATE OR REPLACE FUNCTION public.shoe_create_request(
  p_type TEXT, p_priority TEXT, p_reason TEXT, p_details JSONB,
  p_image_url TEXT DEFAULT NULL
) RETURNS shoe_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request shoe_requests%ROWTYPE; v_display TEXT; v_serial BIGINT;
  v_quantity INTEGER; v_unit NUMERIC; v_original NUMERIC; v_discount NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM shoe_profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'An authenticated employee profile is required';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('PURCHASE','DISCOUNT') THEN RAISE EXCEPTION 'Invalid request type'; END IF;
  IF p_priority IS NULL OR p_priority NOT IN ('NORMAL','URGENT','CRITICAL') THEN RAISE EXCEPTION 'Invalid priority'; END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'A business reason is required'; END IF;
  IF p_type = 'PURCHASE' THEN
    v_quantity := (p_details->>'quantity')::INTEGER;
    v_unit := (p_details->>'unit_price')::NUMERIC;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_unit IS NULL OR v_unit < 0 OR v_unit::TEXT IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'A positive quantity and nonnegative unit price are required';
    END IF;
    IF btrim(COALESCE(p_details->>'supplier','')) = '' OR btrim(COALESCE(p_details->>'item_name','')) = ''
       OR btrim(COALESCE(p_details->>'sku','')) = '' THEN RAISE EXCEPTION 'Supplier, item and SKU are required'; END IF;
    v_serial := nextval('shoe_purchase_request_seq');
    v_display := 'PUR-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(v_serial::TEXT,GREATEST(5,length(v_serial::TEXT)),'0');
  ELSE
    v_original := (p_details->>'original_price')::NUMERIC;
    v_discount := (p_details->>'discount_amount')::NUMERIC;
    IF v_original IS NULL OR v_original <= 0 OR v_original::TEXT IN ('NaN','Infinity','-Infinity') OR
       v_discount IS NULL OR v_discount < 0 OR v_discount > v_original OR v_discount::TEXT IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Discount must be between zero and the positive original price';
    END IF;
    IF btrim(COALESCE(p_details->>'customer_name','')) = '' OR btrim(COALESCE(p_details->>'product_name','')) = ''
       OR COALESCE(p_details->>'customer_mobile','') !~ '^[0-9]{10}$'
       OR btrim(COALESCE(p_details->>'sku','')) = '' THEN RAISE EXCEPTION 'Customer, ten-digit mobile, product and SKU are required'; END IF;
    v_serial := nextval('shoe_discount_request_seq');
    v_display := 'DIS-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(v_serial::TEXT,GREATEST(5,length(v_serial::TEXT)),'0');
  END IF;
  INSERT INTO shoe_requests(display_id,type,requester_id,status,priority,reason,image_url)
    VALUES(v_display,p_type,auth.uid(),'PENDING_MANAGEMENT',p_priority,btrim(p_reason),p_image_url)
    RETURNING * INTO v_request;
  IF p_type = 'PURCHASE' THEN
    INSERT INTO shoe_purchase_details(request_id,supplier,item_category,item_name,sku,quantity,unit_price,total_amount)
      VALUES(v_request.id,p_details->>'supplier',p_details->>'item_category',p_details->>'item_name',
             p_details->>'sku',v_quantity,v_unit,v_quantity*v_unit);
  ELSE
    INSERT INTO shoe_discount_details(request_id,customer_name,customer_mobile,product_name,brand,sku,
      original_price,discount_amount,discount_percentage,final_price)
      VALUES(v_request.id,p_details->>'customer_name',p_details->>'customer_mobile',p_details->>'product_name',
        p_details->>'brand',p_details->>'sku',v_original,v_discount,round(v_discount/v_original*100,2),v_original-v_discount);
  END IF;
  INSERT INTO shoe_audit_logs(request_id,user_id,action,new_status,remarks)
    VALUES(v_request.id,auth.uid(),'CREATED','PENDING_MANAGEMENT','Submitted for management approval.');
  INSERT INTO shoe_notifications(user_id,request_id,message,is_read)
    SELECT id,v_request.id,'Request ' || v_display || ' is awaiting management approval.',FALSE
    FROM shoe_profiles WHERE role IN ('ADMIN','NARENDRA','SANJEEV') AND id <> auth.uid();
  RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.shoe_create_request(TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_create_request(TEXT,TEXT,TEXT,JSONB,TEXT) TO authenticated;
-- All submission writes now go through the transaction above.
DROP POLICY shoe_requests_insert ON shoe_requests;


COMMIT;
