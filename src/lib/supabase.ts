// ============================================================
// Supabase Client Helpers
// ============================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Server-side admin client (service role) ─────────────────
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return adminClient;
}

// ── Client-side anonymous client ────────────────────────────
let anonClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (anonClient) return anonClient;

  anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return anonClient;
}
