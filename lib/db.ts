import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the secret key. Never import this from
// client components. Env vars are set in Vercel (and .env.local for dev).
let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type CreatorRecord = {
  first_seen_at: string;
  visit_count: number;
};

// Records a portal visit and returns the creator's row. Returns null when
// Supabase isn't configured or errors, so the portal still renders.
export async function recordCreatorVisit(shop: string, customerId: string): Promise<CreatorRecord | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .rpc("record_creator_visit", { p_shop: shop, p_customer_id: Number(customerId) })
    .single<CreatorRecord>();
  if (error) {
    console.error("record_creator_visit failed", error);
    return null;
  }
  return data;
}
