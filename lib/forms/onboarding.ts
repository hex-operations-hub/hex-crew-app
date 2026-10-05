import { hasRecentApplication, markApplicationLink, saveApplication } from "@/lib/db";
import { isValidFormToken } from "@/lib/form-token";
import {
  createCustomer,
  findCustomerIdByEmail,
  getCustomer,
  setCustomerProfile,
  tagCustomer,
  type CrewProfileField,
} from "@/lib/shopify-admin";
import { failed, sent, textField, type FormOutcome, type ProxyRequest } from "./types";

export const APPLICANT_TAG = "hex-crew-applicant";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Onboarding tab intake: save to Supabase, then link to a Shopify customer.
//   signed in              -> tag + profile on their own customer record
//   signed out, new email  -> create the customer with tag + profile
//   signed out, known email-> saved but customer left untouched (anyone could
//                             type someone else's email); flagged for HEX
export async function submitOnboarding(proxy: ProxyRequest, form: FormData): Promise<FormOutcome> {
  // Bots fill every field, including the hidden one; pretend it worked.
  if (textField(form, "crew_website", 200)) return sent;
  if (!isValidFormToken(String(form.get("crew_token") ?? ""), proxy.customerId ?? "anon")) {
    return failed("This form expired. Refresh the page and try again.");
  }

  const intake = {
    name: textField(form, "apply[name]", 100),
    email: textField(form, "apply[email]", 200).toLowerCase(),
    tribe: textField(form, "apply[tribe]", 50),
    training: textField(form, "apply[training]", 150),
    quote: textField(form, "apply[quote]", 300),
    quoteSource: textField(form, "apply[quote_source]", 100),
    contentLink: textField(form, "apply[content_link]", 500),
  };

  // Signed-in creators apply with their account email, not whatever was typed.
  if (proxy.customerId) {
    const customer = await getCustomer(proxy.shop, proxy.customerId).catch(() => null);
    if (customer?.email) intake.email = customer.email.toLowerCase();
  }

  if (!intake.name || !intake.tribe || !intake.training) return failed("Name, tribe and where you train are required.");
  if (!EMAIL.test(intake.email)) return failed("Enter a valid email address.");
  if (!/^https?:\/\/\S+\.\S+/i.test(intake.contentLink)) {
    return failed("Add a shared Drive, Dropbox or WeTransfer link starting with https://");
  }

  if (await hasRecentApplication(proxy.shop, intake.email)) return sent;

  const id = await saveApplication({
    shop: proxy.shop,
    shopify_customer_id: proxy.customerId ? Number(proxy.customerId) : null,
    name: intake.name,
    email: intake.email,
    tribe: intake.tribe,
    training_location: intake.training,
    quote: intake.quote || null,
    quote_source: intake.quoteSource || null,
    content_link: intake.contentLink,
  });
  if (!id) return failed("We couldn't save your intake. Please try again in a minute.");

  const profile: CrewProfileField[] = [
    { key: "tribe", type: "single_line_text_field", value: intake.tribe },
    { key: "training_location", type: "single_line_text_field", value: intake.training },
    { key: "content_link", type: "url", value: intake.contentLink },
    { key: "applied_at", type: "date_time", value: new Date().toISOString() },
    ...(intake.quote ? [{ key: "quote", type: "multi_line_text_field", value: intake.quote }] : []),
    ...(intake.quoteSource ? [{ key: "quote_source", type: "single_line_text_field", value: intake.quoteSource }] : []),
  ];

  try {
    if (proxy.customerId) {
      await tagCustomer(proxy.shop, proxy.customerId, [APPLICANT_TAG]);
      await setCustomerProfile(proxy.shop, proxy.customerId, profile);
      await markApplicationLink(id, { customerLink: "signed_in", customerId: proxy.customerId });
    } else {
      const existing = await findCustomerIdByEmail(proxy.shop, intake.email);
      if (existing) {
        await markApplicationLink(id, { customerLink: "existing_unverified", customerId: existing });
      } else {
        const created = await createCustomer(proxy.shop, {
          email: intake.email,
          firstName: intake.name,
          tags: [APPLICANT_TAG],
          profile,
        });
        await markApplicationLink(id, { customerLink: "created", customerId: created });
      }
    }
  } catch (error) {
    // The intake is saved; the Shopify link can be redone from Supabase.
    console.error("Linking application to Shopify failed", error);
    await markApplicationLink(id, { customerLink: "error", error: String(error).slice(0, 500) });
  }
  return sent;
}
