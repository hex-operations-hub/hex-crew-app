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
  const call = async () => {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": await getToken(shop),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
    return (await res.json()) as { data: T; errors?: { message: string; extensions?: { code?: string } }[] };
  };

  let { data, errors } = await call();
  // A cached token predates any newly granted scopes; get a fresh one and retry once.
  if (errors?.some((e) => e.extensions?.code === "ACCESS_DENIED") && tokens.has(shop)) {
    tokens.delete(shop);
    ({ data, errors } = await call());
  }
  if (errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
  return data;
}

export type CrewCustomer = {
  firstName: string | null;
  displayName: string;
  email: string | null;
  tags: string[];
};

const customerGid = (id: string) => `gid://shopify/Customer/${id}`;

export async function getCustomer(shop: string, customerId: string): Promise<CrewCustomer | null> {
  const data = await adminGraphql<{
    customer: (Omit<CrewCustomer, "email"> & { defaultEmailAddress: { emailAddress: string } | null }) | null;
  }>(
    shop,
    `query CrewCustomer($id: ID!) {
      customer(id: $id) { firstName displayName tags defaultEmailAddress { emailAddress } }
    }`,
    { id: customerGid(customerId) },
  );
  if (!data.customer) return null;
  const { defaultEmailAddress, ...rest } = data.customer;
  return { ...rest, email: defaultEmailAddress?.emailAddress ?? null };
}

type UserError = { field: string[] | null; message: string };

function assertNoUserErrors(action: string, errors: UserError[]) {
  if (errors.length) throw new Error(`${action}: ${errors.map((e) => e.message).join("; ")}`);
}

// Returns the numeric ID of the customer with this email, if any.
export async function findCustomerIdByEmail(shop: string, email: string): Promise<string | null> {
  const data = await adminGraphql<{ customers: { nodes: { id: string }[] } }>(
    shop,
    `query CrewFindCustomer($query: String!) {
      customers(first: 1, query: $query) { nodes { id } }
    }`,
    { query: `email:"${email.replace(/["\\]/g, "")}"` },
  );
  return data.customers.nodes[0]?.id.split("/").pop() ?? null;
}

export type CrewProfileField = { key: string; type: string; value: string };

const PROFILE_NAMESPACE = "hex_crew";

export async function createCustomer(
  shop: string,
  input: { email: string; firstName: string; tags: string[]; profile: CrewProfileField[] },
): Promise<string> {
  const data = await adminGraphql<{
    customerCreate: { customer: { id: string } | null; userErrors: UserError[] };
  }>(
    shop,
    `mutation CrewCreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) { customer { id } userErrors { field message } }
    }`,
    {
      input: {
        email: input.email,
        firstName: input.firstName,
        tags: input.tags,
        metafields: input.profile.map((f) => ({ namespace: PROFILE_NAMESPACE, ...f })),
      },
    },
  );
  assertNoUserErrors("customerCreate", data.customerCreate.userErrors);
  return data.customerCreate.customer!.id.split("/").pop()!;
}

export async function tagCustomer(shop: string, customerId: string, tags: string[]) {
  const data = await adminGraphql<{ tagsAdd: { userErrors: UserError[] } }>(
    shop,
    `mutation CrewTagCustomer($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } }
    }`,
    { id: customerGid(customerId), tags },
  );
  assertNoUserErrors("tagsAdd", data.tagsAdd.userErrors);
}

export async function setCustomerProfile(shop: string, customerId: string, profile: CrewProfileField[]) {
  const data = await adminGraphql<{ metafieldsSet: { userErrors: UserError[] } }>(
    shop,
    `mutation CrewSetProfile($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { metafields { key } userErrors { field message code } }
    }`,
    {
      metafields: profile.map((f) => ({ ownerId: customerGid(customerId), namespace: PROFILE_NAMESPACE, ...f })),
    },
  );
  assertNoUserErrors("metafieldsSet", data.metafieldsSet.userErrors);
}
