-- Allow an ADMIN to create a profile row for another user (new employees).
-- The anon client cannot satisfy the "insert own profile" RLS policy when the
-- admin is creating a user other than themselves, so we expose a SECURITY
-- DEFINER function that verifies the caller is an admin before inserting.

CREATE OR REPLACE FUNCTION shoe_admin_create_profile(
  p_id UUID,
  p_full_name TEXT,
  p_employee_code TEXT,
  p_department TEXT,
  p_showroom_location TEXT,
  p_role TEXT
)
RETURNS shoe_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_profile shoe_profiles%ROWTYPE;
BEGIN
  SELECT role INTO v_caller_role FROM shoe_profiles WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can create user profiles';
  END IF;

  INSERT INTO shoe_profiles (id, full_name, employee_code, department, showroom_location, role)
  VALUES (p_id, p_full_name, p_employee_code, p_department, p_showroom_location, p_role)
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION shoe_admin_create_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Allow admins to update/delete any profile (role changes, edits, removals).
DROP POLICY IF EXISTS "Admins can update any profile" ON shoe_profiles;
DROP POLICY IF EXISTS "Admins can delete any profile" ON shoe_profiles;

CREATE POLICY "Admins can update any profile" ON shoe_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM shoe_profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN')
  );

CREATE POLICY "Admins can delete any profile" ON shoe_profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM shoe_profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN')
  );
