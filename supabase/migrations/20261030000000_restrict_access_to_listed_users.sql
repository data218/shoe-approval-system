-- Only profiles provisioned by Admin grant application access.
BEGIN;
CREATE OR REPLACE FUNCTION public.shoe_is_listed_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.shoe_profiles WHERE id = auth.uid()
    AND role IN ('REQUESTER','NARENDRA','SANJEEV','ADMIN'));
$$;
REVOKE ALL ON FUNCTION public.shoe_is_listed_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_is_listed_user() TO authenticated;

-- No authenticated user can add themselves to the employee list.
DO $$ DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public'
    AND tablename='shoe_profiles' AND cmd IN ('INSERT','ALL')
  LOOP EXECUTE format('DROP POLICY %I ON public.shoe_profiles',p.policyname); END LOOP;
END $$;
CREATE POLICY shoe_profiles_insert ON public.shoe_profiles FOR INSERT TO authenticated
  WITH CHECK (public.shoe_is_admin());

-- Restrictive policies also protect against any older permissive policies.
DO $$ DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'shoe\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS shoe_listed_users_only ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY shoe_listed_users_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.shoe_is_listed_user()) WITH CHECK (public.shoe_is_listed_user())',t.tablename);
  END LOOP;
END $$;
DROP POLICY IF EXISTS shoe_listed_storage_only ON storage.objects;
CREATE POLICY shoe_listed_storage_only ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id NOT IN ('request-images','shoe-petty-cash-receipts') OR public.shoe_is_listed_user())
  WITH CHECK (bucket_id NOT IN ('request-images','shoe-petty-cash-receipts') OR public.shoe_is_listed_user());

CREATE OR REPLACE FUNCTION public.shoe_require_listed_user()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.shoe_is_listed_user() THEN
    RAISE EXCEPTION 'Access denied: this account is not in User Management';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.shoe_require_listed_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shoe_require_listed_user() TO authenticated;
DO $$ DECLARE f RECORD; definition TEXT;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('shoe_petty_cash_create_request','shoe_petty_cash_resubmit')
  LOOP
    definition := pg_get_functiondef(f.oid);
    IF position('shoe_require_listed_user' IN definition)=0 THEN
      definition := regexp_replace(definition, '\mBEGIN\M', E'BEGIN\n  PERFORM public.shoe_require_listed_user();', 'i');
      EXECUTE definition;
    END IF;
  END LOOP;
END $$;
-- Notification helpers are internal, not callable directly by outsiders.
REVOKE EXECUTE ON FUNCTION public.shoe_petty_cash_notify_roles(TEXT[],TEXT),
  public.shoe_petty_cash_notify_user(UUID,TEXT) FROM PUBLIC, anon, authenticated;

-- Unlisted login accounts cannot obtain new sessions. New Auth accounts are
-- blocked until an Admin provisions their employee profile in the same transaction.
CREATE OR REPLACE FUNCTION public.shoe_block_unlisted_auth_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.shoe_profiles WHERE id=NEW.id) THEN
    NEW.banned_until := NOW() + INTERVAL '100 years';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shoe_block_unlisted_auth_account ON auth.users;
CREATE TRIGGER shoe_block_unlisted_auth_account BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.shoe_block_unlisted_auth_account();

CREATE OR REPLACE FUNCTION public.shoe_sync_listed_account_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE auth.users SET banned_until=NULL, updated_at=NOW() WHERE id=NEW.id;
    RETURN NEW;
  END IF;
  UPDATE auth.users SET banned_until=NOW()+INTERVAL '100 years',updated_at=NOW() WHERE id=OLD.id;
  DELETE FROM auth.refresh_tokens WHERE user_id::TEXT=OLD.id::TEXT;
  DELETE FROM auth.sessions WHERE user_id=OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS shoe_sync_listed_account_access ON public.shoe_profiles;
CREATE TRIGGER shoe_sync_listed_account_access AFTER INSERT OR DELETE ON public.shoe_profiles
  FOR EACH ROW EXECUTE FUNCTION public.shoe_sync_listed_account_access();
REVOKE ALL ON FUNCTION public.shoe_block_unlisted_auth_account(),public.shoe_sync_listed_account_access()
  FROM PUBLIC,anon,authenticated;

UPDATE auth.users u SET banned_until=NOW()+INTERVAL '100 years',updated_at=NOW()
  WHERE NOT EXISTS(SELECT 1 FROM public.shoe_profiles p WHERE p.id=u.id);
DELETE FROM auth.refresh_tokens t WHERE NOT EXISTS(SELECT 1 FROM public.shoe_profiles p WHERE p.id::TEXT=t.user_id::TEXT);
DELETE FROM auth.sessions s WHERE NOT EXISTS(SELECT 1 FROM public.shoe_profiles p WHERE p.id=s.user_id);
COMMIT;
