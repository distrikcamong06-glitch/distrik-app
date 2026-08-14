// Lets an admin directly set another member's password.
//
// This is the one operation in this app that genuinely needs the
// service-role key (auth.admin.updateUserById), which must never be
// shipped to the browser — so it lives here, server-side, instead of a
// Postgres RPC. The caller's identity + admin role is verified with their
// own JWT before the service-role client is ever touched.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { user_id, new_password } = await req.json();

    if (!user_id || typeof new_password !== 'string' || new_password.length < 6) {
      return jsonResponse({ error: 'user_id and new_password (min 6 characters) are required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Scoped to the caller — used only to verify who's asking and that
    // they're an admin, via the same RLS the rest of the app relies on.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid session' }, 401);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Only admins can set another member\'s password' }, 403);
    }

    // Elevated client, only reached after the admin check above passes.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 400);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
