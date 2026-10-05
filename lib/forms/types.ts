// A verified app proxy request (signature and timestamp already checked).
export type ProxyRequest = { shop: string; customerId: string | null; pathPrefix: string };

export type FormOutcome = { status: "sent" } | { status: "error"; message: string };

export const sent: FormOutcome = { status: "sent" };
export const failed = (message: string): FormOutcome => ({ status: "error", message });

// Reads a trimmed, length-capped text field.
export function textField(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "").trim().slice(0, max);
}
