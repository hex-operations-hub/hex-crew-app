// Admin API access via the client credentials grant. This only works when the
// app and the store are in the same Shopify organization (HEX's org).
// https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
const API_VERSION = "2026-07";

const tokens = new Map<string, { token: string; expiresAt: number }>();

async function getToken(shop: string): Promise<string> {
  const cached = tokens.get(shop);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_API_KEY ?? "",
      client_secret: process.env.SHOPIFY_API_SECRET ?? "",
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  tokens.set(shop, { token: access_token, expiresAt: Date.now() + expires_in * 1000 });
  return access_token;
}

export async function adminGraphql<T>(shop: string, query: string, variables = {}): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await getToken(shop),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
  return data as T;
}

export type CrewCustomer = {
  firstName: string | null;
  displayName: string;
  tags: string[];
};

export async function getCustomer(shop: string, customerId: string): Promise<CrewCustomer | null> {
  const data = await adminGraphql<{ customer: CrewCustomer | null }>(
    shop,
    `query CrewCustomer($id: ID!) {
      customer(id: $id) { firstName displayName tags }
    }`,
    { id: `gid://shopify/Customer/${customerId}` },
  );
  return data.customer;
}
