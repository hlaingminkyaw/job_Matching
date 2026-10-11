import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 *
 * The service role key bypasses row-level security, so this module must never
 * reach the browser bundle — only import it from route handlers, server
 * components, and scripts.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local (see .env.example) and restart the dev server.`,
    );
  }
  return value;
}

let cached: SupabaseClient | null = null;

/** Lazily created so a missing env var fails the request, not the build. */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabaseAdmin() was called in the browser. It holds the service role key and is server-only.",
    );
  }

  if (!cached) {
    cached = createClient(
      required("NEXT_PUBLIC_SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  return cached;
}
