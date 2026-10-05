import { createHmac, timingSafeEqual } from "node:crypto";

// Shopify signs every app proxy request. Rebuild the message the same way
// Shopify does: drop `signature`, join repeated keys with ",", format each
// pair as key=value, sort, and concatenate with no separator.
// https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
export function isValidProxySignature(params: URLSearchParams, secret: string): boolean {
  const signature = params.get("signature");
  if (!signature || !secret) return false;

  const grouped = new Map<string, string[]>();
  for (const [key, value] of params) {
    if (key === "signature") continue;
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  const message = [...grouped]
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort()
    .join("");

  const expected = createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
