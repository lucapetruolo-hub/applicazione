/**
 * Messaggi automatici della chat in seconda persona per chi li ha fatti
 * (docs/CHANGELOG.md §346): il server li scrive in terza persona ("Il cliente
 * ha confermato…"), giusti per l'altra parte, ma al cliente stesso "il
 * cliente" sembrava un'altra persona. Solo la parte iniziale cambia, il resto
 * del testo resta quello del server.
 */
export function personalizeEventMessage(message: string, actor: "CLIENT" | "PROFESSIONAL" | "SYSTEM", viewerRole: "CLIENT" | "PROFESSIONAL"): string {
  if (actor !== viewerRole) return message;
  const subject = viewerRole === "CLIENT" ? "Il cliente " : "Il professionista ";
  if (!message.startsWith(subject)) return message;
  // Scritte per il professionista ("direttamente a te", "ricevuta anche da te").
  if (viewerRole === "CLIENT" && /\b(a|da) te\b/.test(message) && message.startsWith("Il cliente ha inviato una richiesta")) {
    return "Hai inviato la richiesta di preventivo.";
  }
  const rest = message.slice(subject.length);
  if (rest.startsWith("ha ")) return `Hai ${rest.slice(3)}`;
  if (rest.startsWith("sta arrivando")) return `Hai avvisato che stai arrivando${rest.slice("sta arrivando".length)}`;
  return message;
}
