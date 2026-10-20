-- Admin "Create User" via SQL RPC — no Edge Function or service key required.
-- Creates (or heals) the auth account directly and upserts the shoe profile.
-- Safe to run multiple times (idempotent).

-- 0. Ensure pgcrypto is available for crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Helper: create or heal an auth.users account for an email.
--    Restricted to definer use only (never callable from the client).
CREATE OR REPLACE FUNCTION public.shoe_admin_create_auth_user(
  p_email text,
  p_password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid;
  v_now timestamptz := now();
BEGIN
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      lower(p_email),
      crypt(p_password, gen_salt('bf')),
      v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      v_now,
      v_now
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_uid,
      v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', lower(p_email), 'email_verified', true),
      'email',
      v_now, v_now, v_now
    );
  ELSE
    -- Heal orphaned accounts: make the admin-chosen password work & confirm email
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, v_now),
        updated_at = v_now
    WHERE id = v_uid;
  END IF;

  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.shoe_admin_create_auth_user(text, text) FROM PUBLIC, anon, authenticated;

-- 2. Main RPC called by the app (admins only)
CREATE OR REPLACE FUNCTION public.shoe_admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_employee_code text,
  p_department text DEFAULT 'Sales',
  p_showroom_location text DEFAULT 'Main Branch',
  p_role text DEFAULT 'REQUESTER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role text;
  v_uid uuid;
BEGIN
  IF p_email IS NULL OR p_password IS NULL OR p_full_name IS NULL OR p_employee_code IS NULL THEN
    RAISE EXCEPTION 'email, password, full_name and employee_code are required';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  SELECT role INTO v_caller_role
  FROM shoe_profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can create users';
  END IF;

  v_uid := public.shoe_admin_create_auth_user(p_email, p_password);

  INSERT INTO shoe_profiles (id, full_name, employee_code, department, showroom_location, role)
  VALUES (v_uid, p_full_name, p_employee_code, p_department, p_showroom_location, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name         = EXCLUDED.full_name,
    employee_code     = EXCLUDED.employee_code,
    department        = EXCLUDED.department,
    showroom_location = EXCLUDED.showroom_location,
    role              = EXCLUDED.role;

  RETURN jsonb_build_object('id', v_uid, 'email', lower(p_email));
END;
$$;

GRANT EXECUTE ON FUNCTION public.shoe_admin_create_user(text, text, text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.shoe_admin_create_user(text, text, text, text, text, text, text) FROM PUBLIC, anon;
