import { brand } from "@/lib/brand";
import { createPitchTask } from "@/lib/clickup";
import { findRecentDuplicatePitch, markPitchClickUp, savePitch, type NewPitch } from "@/lib/db";
import { isValidFormToken } from "@/lib/form-token";
import { getCustomer } from "@/lib/shopify-admin";
import { failed, sent, textField, type FormOutcome, type ProxyRequest } from "./types";

// Pitches & Collabs tab: save to Supabase, then mirror to ClickUp.
export async function submitPitch(proxy: ProxyRequest, form: FormData): Promise<FormOutcome> {
  if (!proxy.customerId) return failed("Sign in to send a pitch.");
  if (!isValidFormToken(String(form.get("crew_token") ?? ""), proxy.customerId)) {
    return failed("This form expired. Refresh the page and try again.");
  }

  const pitch = {
    category: textField(form, "pitch[category]", 100),
    value: textField(form, "pitch[value]", 50),
    title: textField(form, "pitch[title]", 200),
    body: textField(form, "pitch[body]", 5000),
  };
  if (!pitch.category || !pitch.title || !pitch.body) return failed("Category, title and pitch are required.");

  const customer = await getCustomer(proxy.shop, proxy.customerId).catch(() => null);
  const name = customer?.displayName ?? null;
  const email = customer?.email ?? null;

  const record: NewPitch = {
    shop: proxy.shop,
    shopify_customer_id: Number(proxy.customerId),
    creator_name: name,
    creator_email: email,
    category: pitch.category,
    suggested_value: pitch.value || null,
    title: pitch.title,
    body: pitch.body,
  };
  if (await findRecentDuplicatePitch(record)) return sent;

  const id = await savePitch(record);
  if (!id) return failed("We couldn't save your pitch. Please try again in a minute.");

  const task = await createPitchTask({
    name: `[Pitch] ${pitch.title}`,
    markdown: [
      `**Creator:** ${name ?? "Unknown"}${email ? ` (${email})` : ""}`,
      `**Category:** ${pitch.category}`,
      `**Suggested value:** ${pitch.value || "Not given"}`,
      "",
      pitch.body,
      "",
      `---`,
      `Submitted via ${brand.programme} portal on ${proxy.shop}. Pitch ID: ${id}`,
    ].join("\n"),
  });
  if ("id" in task) await markPitchClickUp(id, { taskId: task.id });
  else {
    console.error("ClickUp task not created", task.error);
    await markPitchClickUp(id, { error: task.error });
  }
  // The pitch is saved either way; ClickUp failures are retried from Supabase.
  return sent;
}
