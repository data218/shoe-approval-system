-- Admin-only, atomic editing of login credentials and employee profile.
BEGIN;
-- Populate the editor with the actual login email, including older profiles.
UPDATE public.shoe_profiles p SET email = lower(u.email)
FROM auth.users u WHERE u.id = p.id AND p.email IS DISTINCT FROM lower(u.email);

CREATE OR REPLACE FUNCTION public.shoe_admin_update_user(
  p_user_id UUID, p_email TEXT, p_full_name TEXT, p_employee_code TEXT,
  p_department TEXT, p_showroom_location TEXT, p_role TEXT,
  p_password TEXT DEFAULT NULL
) RETURNS public.shoe_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE v_profile public.shoe_profiles%ROWTYPE; v_email TEXT := lower(btrim(p_email));
BEGIN
  IF auth.uid() IS NULL OR NOT public.shoe_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can edit users';
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid login email is required';
  END IF;
  IF btrim(COALESCE(p_full_name,'')) = '' OR btrim(COALESCE(p_employee_code,'')) = '' THEN
    RAISE EXCEPTION 'Full name and employee code are required';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('REQUESTER','NARENDRA','SANJEEV','ADMIN') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF p_user_id = auth.uid() AND p_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'You cannot remove your own administrator role';
  END IF;
  IF p_password IS NOT NULL AND p_password <> '' AND length(p_password) < 6 THEN
    RAISE EXCEPTION 'New password must be at least 6 characters';
  END IF;
  SELECT * INTO v_profile FROM public.shoe_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee profile not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Login account not found';
  END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email) = v_email AND id <> p_user_id) THEN
    RAISE EXCEPTION 'This email is already used by another account';
  END IF;
  UPDATE auth.users SET email = v_email,
    encrypted_password = CASE WHEN p_password IS NOT NULL AND p_password <> ''
      THEN crypt(p_password,gen_salt('bf')) ELSE encrypted_password END,
    updated_at = NOW() WHERE id = p_user_id;
  UPDATE auth.identities
    SET identity_data = jsonb_set(COALESCE(identity_data,'{}'::jsonb),'{email}',to_jsonb(v_email)), updated_at = NOW()
    WHERE user_id = p_user_id AND provider = 'email';
  UPDATE public.shoe_profiles SET email = v_email, full_name = btrim(p_full_name),
    employee_code = btrim(p_employee_code), department = btrim(p_department),
    showroom_location = btrim(p_showroom_location), role = p_role
    WHERE id = p_user_id RETURNING * INTO v_profile;
  RETURN v_profile;
END $$;
REVOKE ALL ON FUNCTION public.shoe_admin_update_user(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_admin_update_user(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
COMMIT;
