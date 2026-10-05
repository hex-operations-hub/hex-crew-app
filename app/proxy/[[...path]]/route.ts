import { readFile } from "node:fs/promises";
import path from "node:path";
import { brand } from "@/lib/brand";
import { recordCreatorVisit } from "@/lib/db";
import { issueFormToken } from "@/lib/form-token";
import { submitOnboarding } from "@/lib/forms/onboarding";
import { submitPitch } from "@/lib/forms/pitch";
import type { FormOutcome, ProxyRequest } from "@/lib/forms/types";
import { isValidProxySignature } from "@/lib/proxy-signature";

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

// POST /apps/crew/<form> -> handler, and the portal tab to show afterwards.
const FORMS = {
  pitch: { handler: submitPitch, tab: "pitches", liquid: "pitch" },
  onboarding: { handler: submitOnboarding, tab: "onboarding", liquid: "onboarding" },
} as const;

function verify(request: Request): ProxyRequest | Response {
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
  const name = new URL(request.url).pathname.replace(/\/$/, "").split("/").pop() ?? "";
  if (!Object.hasOwn(FORMS, name)) return plain("Not found.", 404);
  const form = FORMS[name as keyof typeof FORMS];
  // A missing or malformed body is treated as an empty form (fails validation).
  const body = await request.formData().catch(() => new FormData());
  const outcome = await form.handler(proxy, body);
  return render(proxy, { ...form, outcome });
}

async function render(proxy: ProxyRequest, submitted?: { tab: string; liquid: string; outcome: FormOutcome }) {
  // Liquid has no string escaping, so drop characters that could end the
  // string or open a tag. Values come from our code or Shopify's signed query.
  const assign = (name: string, value: string) => `{% assign ${name} = "${value.replace(/["{}%]/g, "")}" %}`;
  const settings = [
    assign("crew_leaderboard", brand.tabs.leaderboard),
    assign("crew_creator_view", brand.tabs.creatorView),
    assign("crew_path_prefix", proxy.pathPrefix),
    assign("crew_form_token", issueFormToken(proxy.customerId ?? "anon")),
    assign("crew_return_tab", submitted?.tab ?? ""),
  ];
  if (submitted) {
    const { outcome, liquid } = submitted;
    settings.push(assign(`crew_${liquid}_status`, outcome.status));
    if (outcome.status === "error") settings.push(assign(`crew_${liquid}_error`, outcome.message));
  }

  return new Response(settings.join("") + (await portalTemplate()), {
    headers: { "Content-Type": "application/liquid", "Cache-Control": "no-store" },
  });
}

function plain(text: string, status: number) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
