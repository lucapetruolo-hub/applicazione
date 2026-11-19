const CARD_BRAND_LABEL: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  diners: "Diners",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
};
const CARD_WALLET_LABEL: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };

/** "Visa •••• 4242", "Apple Pay (Visa •••• 4242)"; vuoto senza le ultime cifre. */
export function formatPaymentCard(brand: unknown, last4: unknown, wallet?: unknown): string {
  if (typeof last4 !== "string" || !last4) return "";
  const name = (typeof brand === "string" && CARD_BRAND_LABEL[brand]) || "Carta";
  const card = `${name} •••• ${last4}`;
  const walletName = typeof wallet === "string" ? CARD_WALLET_LABEL[wallet] : undefined;
  return walletName ? `${walletName} (${card})` : card;
}
