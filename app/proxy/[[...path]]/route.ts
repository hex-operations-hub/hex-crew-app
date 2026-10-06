import { readFile } from "node:fs/promises";
import path from "node:path";
import { brand, type PortalKey } from "@/lib/brand";
import { getCreatorRecord, getLatestTribe, recordCreatorVisit, type CreatorRecord } from "@/lib/db";
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
  "hex-v2": () => readFile(path.join(process.cwd(), "portal/hex-v2/portal.liquid"), "utf8"),
} satisfies Record<PortalKey, () => Promise<string>>;

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
  return render(request, proxy, await loadCreator(proxy, { countVisit: true }));
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
  return render(request, proxy, await loadCreator(proxy, { countVisit: false }), { ...form, outcome });
}

type Creator = { record: CreatorRecord | null; tribe: string | null };

// Signed-in creators: count the visit (page loads only) and look up their tribe.
async function loadCreator(proxy: ProxyRequest, { countVisit }: { countVisit: boolean }): Promise<Creator> {
  if (!proxy.customerId) return { record: null, tribe: null };
  const [record, tribe] = await Promise.all([
    countVisit ? recordCreatorVisit(proxy.shop, proxy.customerId) : getCreatorRecord(proxy.shop, proxy.customerId),
    getLatestTribe(proxy.shop, proxy.customerId),
  ]);
  // The intake field is free text; keep only a recognised tribe key.
  const key = tribe?.toLowerCase().match(/lift|trail|combat|night|grind/)?.[0] ?? null;
  return { record, tribe: key };
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" });

async function render(
  request: Request,
  proxy: ProxyRequest,
  creator: Creator,
  submitted?: { tab: string; liquid: string; outcome: FormOutcome },
) {
  // Liquid has no string escaping, so drop characters that could end the
  // string or open a tag. Values come from our code or Shopify's signed query.
  const assign = (name: string, value: string) => `{% assign ${name} = "${value.replace(/["{}%]/g, "")}" %}`;
  const settings = [
    assign("crew_leaderboard", brand.tabs.leaderboard),
    assign("crew_creator_view", brand.tabs.creatorView),
    assign("crew_path_prefix", proxy.pathPrefix),
    assign("crew_form_token", issueFormToken(proxy.customerId ?? "anon")),
    assign("crew_return_tab", submitted?.tab ?? ""),
    // Images are served by this app; Shopify only proxies the page itself.
    assign("crew_asset_base", `${new URL(request.url).origin}/crew`),
    assign("crew_tribe", creator.tribe ?? ""),
    assign("crew_member_since", creator.record ? formatDate(creator.record.first_seen_at) : ""),
    assign("crew_visits", creator.record ? String(creator.record.visit_count) : ""),
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
