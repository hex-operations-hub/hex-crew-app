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

export type NewPitch = {
  shop: string;
  shopify_customer_id: number;
  creator_name: string | null;
  creator_email: string | null;
  category: string;
  suggested_value: string | null;
  title: string;
  body: string;
};

// Saves a pitch and returns its id, or null if Supabase isn't available.
export async function savePitch(pitch: NewPitch): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.from("pitches").insert(pitch).select("id").single<{ id: string }>();
  if (error) {
    console.error("savePitch failed", error);
    return null;
  }
  return data.id;
}

export async function markPitchClickUp(id: string, result: { taskId?: string; error?: string }) {
  const supabase = db();
  if (!supabase) return;
  const { error } = await supabase
    .from("pitches")
    .update({ clickup_task_id: result.taskId ?? null, clickup_error: result.error ?? null })
    .eq("id", id);
  if (error) console.error("markPitchClickUp failed", error);
}
