import { brand } from "@/lib/brand";
import { isValidProxySignature } from "@/lib/proxy-signature";
import { recordCreatorVisit, type CreatorRecord } from "@/lib/db";
import { getCustomer, type CrewCustomer } from "@/lib/shopify-admin";

// Shopify forwards hexenergy.au/apps/crew/* here, adding shop,
// logged_in_customer_id, path_prefix, timestamp and signature to the query.
export const dynamic = "force-dynamic";

const MAX_AGE_SECONDS = 5 * 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // Local preview without Shopify: /proxy?preview=1 (dev server only).
  if (process.env.NODE_ENV === "development" && params.get("preview") === "1") {
    return html(page({ firstName: "Test", displayName: "Test Creator", tags: ["hex-crew"] }, null, "local preview"));
  }

  if (!isValidProxySignature(params, process.env.SHOPIFY_API_SECRET ?? "")) {
    return html(message("This page only works through the HEX store."), 401);
  }
  const age = Math.abs(Date.now() / 1000 - Number(params.get("timestamp")));
  if (!(age < MAX_AGE_SECONDS)) {
    return html(message("This link has expired. Refresh the page."), 401);
  }

  const shop = params.get("shop") ?? "";
  const customerId = params.get("logged_in_customer_id");
  if (!customerId) {
    const login = `/account/login?return_url=${encodeURIComponent(params.get("path_prefix") ?? "/apps/crew")}`;
    return html(message(`Sign in to see your ${brand.programme} page.`, { href: login, label: "Sign in" }));
  }

  try {
    const customer = await getCustomer(shop, customerId);
    if (!customer) return html(message("We couldn't find your account."), 404);
    const record = await recordCreatorVisit(shop, customerId);
    return html(page(customer, record, shop));
  } catch (error) {
    console.error(error);
    return html(message("Something went wrong loading your account."), 500);
  }
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function shell(content: string) {
  const c = brand.colors;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${brand.programme}</title>
<style>
  body{margin:0;background:${c.bg};color:${c.ink};font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{max-width:560px;margin:64px auto;padding:0 16px}
  .card{background:#fff;border:1px solid ${c.border};border-radius:12px;padding:28px}
  .eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${c.gold};font-weight:600}
  h1{font-size:32px;margin:8px 0 20px;letter-spacing:-.02em}
  dl{display:grid;grid-template-columns:140px 1fr;gap:10px;margin:0}
  dt{color:${c.mute}} dd{margin:0;font-weight:600}
  .muted{color:${c.mute};font-size:13px;margin-top:20px}
  a.btn{display:inline-block;margin-top:16px;background:${c.ink};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none}
</style></head><body><main>${content}</main></body></html>`;
}

function page(customer: CrewCustomer, record: CreatorRecord | null, source: string) {
  const name = escape(customer.firstName || customer.displayName);
  const isCrew = customer.tags.some((t) => t.toLowerCase().startsWith("hex-crew"));
  return shell(`<div class="card">
  <div class="eyebrow">${brand.programme}</div>
  <h1>Hi ${name}</h1>
  <dl>
    <dt>Crew status</dt><dd>${isCrew ? "Crew member" : "Not in the Crew yet"}</dd>
    <dt>Portal member since</dt><dd>${record ? formatDate(record.first_seen_at) : "Not connected yet"}</dd>
    <dt>Portal visits</dt><dd>${record ? record.visit_count : "Not connected yet"}</dd>
    <dt>Referral code</dt><dd>Not connected yet</dd>
    <dt>Commission</dt><dd>Not connected yet</dd>
  </dl>
  <p class="muted">Code and commission will come from GoAffPro once API access is confirmed. Source: ${escape(source)}</p>
</div>`);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" });
}

function message(text: string, link?: { href: string; label: string }) {
  return shell(`<div class="card"><div class="eyebrow">${brand.programme}</div>
  <h1>${escape(text)}</h1>${link ? `<a class="btn" href="${escape(link.href)}">${escape(link.label)}</a>` : ""}</div>`);
}
