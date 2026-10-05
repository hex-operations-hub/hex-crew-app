import { readFile } from "node:fs/promises";
import path from "node:path";
import { brand } from "@/lib/brand";
import { recordCreatorVisit } from "@/lib/db";
import { isValidProxySignature } from "@/lib/proxy-signature";

// Shopify forwards hexenergy.au/apps/crew/* here, adding shop,
// logged_in_customer_id, path_prefix, timestamp and signature to the query.
// We answer with Liquid, which Shopify renders inside the store's theme
// (header, footer, customer object, native forms).
export const dynamic = "force-dynamic";

const MAX_AGE_SECONDS = 5 * 60;

let template: string | null = null;

async function portalTemplate() {
  template ??= await readFile(path.join(process.cwd(), brand.portalTemplate), "utf8");
  return template;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  if (!isValidProxySignature(params, process.env.SHOPIFY_API_SECRET ?? "")) {
    return plain("This page only works through the HEX store.", 401);
  }
  const age = Math.abs(Date.now() / 1000 - Number(params.get("timestamp")));
  if (!(age < MAX_AGE_SECONDS)) {
    return plain("This link has expired. Refresh the page.", 401);
  }

  const shop = params.get("shop") ?? "";
  const customerId = params.get("logged_in_customer_id");
  if (customerId) await recordCreatorVisit(shop, customerId);

  const settings = [
    `{% assign crew_leaderboard = '${brand.tabs.leaderboard}' %}`,
    `{% assign crew_creator_view = '${brand.tabs.creatorView}' %}`,
  ].join("");

  return new Response(settings + (await portalTemplate()), {
    headers: { "Content-Type": "application/liquid", "Cache-Control": "no-store" },
  });
}

function plain(text: string, status: number) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
