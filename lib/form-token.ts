import { createHmac, timingSafeEqual } from "node:crypto";

// Ties a portal form to the signed-in customer who loaded it, so another
// site can't submit on a creator's behalf through the store's proxy URL.
const MAX_AGE_SECONDS = 4 * 60 * 60;

function sign(customerId: string, issuedAt: number) {
  return createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(`crew-form.${customerId}.${issuedAt}`)
    .digest("hex");
}

export function issueFormToken(customerId: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  return `${issuedAt}.${sign(customerId, issuedAt)}`;
}

export function isValidFormToken(token: string, customerId: string): boolean {
  const [issued, mac] = token.split(".");
  const issuedAt = Number(issued);
  if (!mac || !Number.isFinite(issuedAt)) return false;
  if (Date.now() / 1000 - issuedAt > MAX_AGE_SECONDS) return false;
  const a = Buffer.from(sign(customerId, issuedAt), "utf8");
  const b = Buffer.from(mac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
