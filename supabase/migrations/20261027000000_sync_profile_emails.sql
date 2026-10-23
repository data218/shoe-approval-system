-- Show actual login emails in User Management, replacing missing/placeholders.
BEGIN;

UPDATE public.shoe_profiles p SET email = lower(u.email)
FROM auth.users u WHERE u.id = p.id AND p.email IS DISTINCT FROM lower(u.email);

CREATE OR REPLACE FUNCTION public.shoe_profile_login_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  SELECT lower(u.email) INTO NEW.email FROM auth.users u WHERE u.id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shoe_profile_login_email ON public.shoe_profiles;
CREATE TRIGGER shoe_profile_login_email
  BEFORE INSERT OR UPDATE OF email ON public.shoe_profiles
  FOR EACH ROW EXECUTE FUNCTION public.shoe_profile_login_email();

CREATE OR REPLACE FUNCTION public.shoe_sync_auth_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  UPDATE public.shoe_profiles SET email = lower(NEW.email) WHERE id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shoe_sync_auth_email ON auth.users;
CREATE TRIGGER shoe_sync_auth_email AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.shoe_sync_auth_email();

REVOKE ALL ON FUNCTION public.shoe_profile_login_email(), public.shoe_sync_auth_email()
FROM PUBLIC, anon, authenticated;

COMMIT;
