/**
 * Nomi delle persone nell'area admin (misura "dopo" del riordino,
 * docs/changelog/2026-11-03-admin-dopo-la-misura.md): lo stesso nome in ogni
 * pagina, l'attività insieme alla persona ("Bianchi Impianti Elettrici ·
 * Luigi Bianchi") e mai l'email finta di un account chiuso.
 */
export type AdminNameParts = {
  businessName?: string | null;
  name?: string | null;
  surname?: string | null;
  email?: string | null;
  deletedAt?: string | Date | null;
};

/** Email messa al posto di quella vera quando l'account si chiude. */
export function isClosedAccountEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.startsWith("deleted-") && email.endsWith("@deleted.invalid"));
}

export function adminPersonName(parts: AdminNameParts): string {
  const person = [parts.name, parts.surname].filter(Boolean).join(" ").trim();
  const business = parts.businessName?.trim() ?? "";
  if (business && person && business.toLowerCase() !== person.toLowerCase()) return `${business} · ${person}`;
  if (business || person) return business || person;
  if (parts.deletedAt || isClosedAccountEmail(parts.email)) return "Account chiuso";
  return parts.email || "Utente";
}
