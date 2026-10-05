import { readFile } from "node:fs/promises";
import path from "node:path";
import { brand } from "@/lib/brand";
import { createPitchTask } from "@/lib/clickup";
import { markPitchClickUp, recordCreatorVisit, savePitch } from "@/lib/db";
import { isValidFormToken, issueFormToken } from "@/lib/form-token";
import { isValidProxySignature } from "@/lib/proxy-signature";
import { getCustomer } from "@/lib/shopify-admin";

// Shopify forwards hexenergy.au/apps/crew/* here, adding shop,
// logged_in_customer_id, path_prefix, timestamp and signature to the query.
// We answer with Liquid, which Shopify renders inside the store's theme
// (header, footer, customer object).
export const dynamic = "force-dynamic";

const MAX_AGE_SECONDS = 5 * 60;

// Literal paths so the bundler only ships the template files.
const TEMPLATES = {
  hex: () => readFile(path.join(process.cwd(), "portal/hex/portal.liquid"), "utf8"),
} satisfies Record<typeof brand.portal, () => Promise<string>>;

let template: string | null = null;

async function portalTemplate() {
  template ??= await TEMPLATES[brand.portal]();
  return template;
}

type Proxy = { shop: string; customerId: string | null; pathPrefix: string };

function verify(request: Request): Proxy | Response {
  const params = new URL(request.url).searchParams;
  if (!isValidProxySignature(params, process.env.SHOPIFY_API_SECRET ?? "")) {
    return plain("This page only works through the HEX store.", 401);
  }
  const age = Math.abs(Date.now() / 1000 - Number(params.get("timestamp")));
  if (!(age < MAX_AGE_SECONDS)) {
    return plain("This link has expired. Refresh the page.", 401);
  }
  return {
    shop: params.get("shop") ?? "",
    customerId: params.get("logged_in_customer_id") || null,
    pathPrefix: params.get("path_prefix") ?? "/apps/crew",
  };
}

export async function GET(request: Request) {
  const proxy = verify(request);
  if (proxy instanceof Response) return proxy;
  if (proxy.customerId) await recordCreatorVisit(proxy.shop, proxy.customerId);
  return render(proxy);
}

export async function POST(request: Request) {
  const proxy = verify(request);
  if (proxy instanceof Response) return proxy;
  if (!new URL(request.url).pathname.replace(/\/$/, "").endsWith("/pitch")) {
    return plain("Not found.", 404);
  }
  return render(proxy, await submitPitch(proxy, await request.formData()));
}

type PitchOutcome = { status: "sent" } | { status: "error"; message: string };

const LIMITS = { category: 100, value: 50, title: 200, body: 5000 };

async function submitPitch(proxy: Proxy, form: FormData): Promise<PitchOutcome> {
  const error = (message: string): PitchOutcome => ({ status: "error", message });
  if (!proxy.customerId) return error("Sign in to send a pitch.");
  if (!isValidFormToken(String(form.get("crew_token") ?? ""), proxy.customerId)) {
    return error("This form expired. Refresh the page and try again.");
  }

  const field = (name: keyof typeof LIMITS) => String(form.get(`pitch[${name}]`) ?? "").trim().slice(0, LIMITS[name]);
  const pitch = { category: field("category"), value: field("value"), title: field("title"), body: field("body") };
  if (!pitch.category || !pitch.title || !pitch.body) return error("Category, title and pitch are required.");

  const customer = await getCustomer(proxy.shop, proxy.customerId).catch(() => null);
  const name = customer?.displayName ?? null;
  const email = customer?.email ?? null;

  const id = await savePitch({
    shop: proxy.shop,
    shopify_customer_id: Number(proxy.customerId),
    creator_name: name,
    creator_email: email,
    category: pitch.category,
    suggested_value: pitch.value || null,
    title: pitch.title,
    body: pitch.body,
  });
  if (!id) return error("We couldn't save your pitch. Please try again in a minute.");

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
  return { status: "sent" };
}

async function render(proxy: Proxy, pitch?: PitchOutcome) {
  // Liquid has no string escaping, so drop characters that could end the
  // string or open a tag. Values come from our code or Shopify's signed query.
  const assign = (name: string, value: string) => `{% assign ${name} = "${value.replace(/["{}%]/g, "")}" %}`;
  const settings = [
    assign("crew_leaderboard", brand.tabs.leaderboard),
    assign("crew_creator_view", brand.tabs.creatorView),
    assign("crew_path_prefix", proxy.pathPrefix),
    assign("crew_form_token", proxy.customerId ? issueFormToken(proxy.customerId) : ""),
    assign("crew_pitch_status", pitch?.status ?? ""),
    assign("crew_pitch_error", pitch?.status === "error" ? pitch.message : ""),
  ].join("");

  return new Response(settings + (await portalTemplate()), {
    headers: { "Content-Type": "application/liquid", "Cache-Control": "no-store" },
  });
}

function plain(text: string, status: number) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
