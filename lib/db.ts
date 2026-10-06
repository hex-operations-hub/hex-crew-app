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

// Read-only view of the creator's row (used after a form post, where the
// visit was already counted on the page load).
export async function getCreatorRecord(shop: string, customerId: string): Promise<CreatorRecord | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("creators")
    .select("first_seen_at, visit_count")
    .eq("shop", shop)
    .eq("shopify_customer_id", Number(customerId))
    .maybeSingle<CreatorRecord>();
  if (error) {
    console.error("getCreatorRecord failed", error);
    return null;
  }
  return data;
}

// The tribe from the creator's most recent onboarding intake, if any.
export async function getLatestTribe(shop: string, customerId: string): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("applications")
    .select("tribe")
    .eq("shop", shop)
    .eq("shopify_customer_id", Number(customerId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ tribe: string }>();
  if (error) {
    console.error("getLatestTribe failed", error);
    return null;
  }
  return data?.tribe ?? null;
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

const DUPLICATE_WINDOW_MINUTES = 10;

// Returns the id of an identical pitch from the same creator in the last few
// minutes (double-click or resubmitted form), so it isn't saved twice.
export async function findRecentDuplicatePitch(pitch: NewPitch): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pitches")
    .select("id")
    .eq("shop", pitch.shop)
    .eq("shopify_customer_id", pitch.shopify_customer_id)
    .eq("title", pitch.title)
    .eq("body", pitch.body)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) {
    console.error("findRecentDuplicatePitch failed", error);
    return null;
  }
  return data?.id ?? null;
}

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

export type NewApplication = {
  shop: string;
  shopify_customer_id: number | null;
  name: string;
  email: string;
  tribe: string;
  training_location: string;
  quote: string | null;
  quote_source: string | null;
  content_link: string;
};

// True if the same email already applied in the last few minutes
// (double-click or resubmitted form). Failed attempts don't count, so a
// retry after a Shopify error goes through.
export async function hasRecentApplication(shop: string, email: string): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("applications")
    .select("id")
    .eq("shop", shop)
    .eq("email", email.toLowerCase())
    .neq("customer_link", "error")
    .gte("created_at", since)
    .limit(1);
  if (error) {
    console.error("hasRecentApplication failed", error);
    return false;
  }
  return data.length > 0;
}

export async function saveApplication(application: NewApplication): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.from("applications").insert(application).select("id").single<{ id: string }>();
  if (error) {
    console.error("saveApplication failed", error);
    return null;
  }
  return data.id;
}

export async function markApplicationLink(
  id: string,
  link: { customerLink: string; customerId?: string | null; error?: string | null },
) {
  const supabase = db();
  if (!supabase) return;
  const update: Record<string, unknown> = { customer_link: link.customerLink, shopify_error: link.error ?? null };
  if (link.customerId) update.shopify_customer_id = Number(link.customerId);
  const { error } = await supabase.from("applications").update(update).eq("id", id);
  if (error) console.error("markApplicationLink failed", error);
}
