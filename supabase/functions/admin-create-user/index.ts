import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    // Identify the caller using their JWT.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !caller) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Only admins may create users.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await admin
      .from('shoe_profiles')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (callerProfile?.role !== 'ADMIN') {
      return json({ error: 'Only administrators can create users' }, 403);
    }

    const { email, password, full_name, employee_code, department, role, showroom_location } =
      await req.json();

    if (!email || !password || !full_name || !employee_code) {
      return json({ error: 'email, password, full_name and employee_code are required' }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400);
    }

    // Create (or reuse) the auth user. listUsers finds an existing account so a
    // previously orphaned auth user can be healed instead of failing.
    let userId: string | null = null;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (!/already|registered|exists/i.test(createError.message)) {
        return json({ error: createError.message }, 400);
      }
      // Find the existing auth account by email.
      const { data: list, error: listError } = await admin.auth.admin.listUsers();
      if (listError) return json({ error: listError.message }, 400);
      const existing = list.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
      if (!existing) return json({ error: createError.message }, 400);
      userId = existing.id;

      // Reset the password so the admin's chosen credentials work.
      await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    } else {
      userId = created.user?.id ?? null;
    }

    if (!userId) return json({ error: 'Could not resolve the auth user id' }, 500);

    // Upsert the profile (idempotent: heals orphaned accounts too).
    const { error: profileError } = await admin.from('shoe_profiles').upsert(
      {
        id: userId,
        full_name,
        employee_code,
        department: department || 'Sales',
        showroom_location: showroom_location || 'Main Branch',
        role: role || 'REQUESTER',
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      return json({ error: 'Profile creation failed: ' + profileError.message }, 400);
    }

    return json({ id: userId, email }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
