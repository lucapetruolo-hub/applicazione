/**
 * "all'11 dicembre alle 16:36" / "al 12 ottobre alle 09:00": giorno e ora
 * italiani di una scadenza, con l'articolo giusto ("all'" davanti a 8, 11 e
 * all'una). Usata per "Puoi rispondere fino …" (professionista) e "La
 * richiesta resta aperta fino …" (cliente), sul sito e nelle email
 * (docs/CHANGELOG.md §221, §224).
 */
export function formatItalianUntil(value: Date | string, options: { withTime?: boolean } = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  const day = date.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
  const dayArticle = day.startsWith("8 ") || day.startsWith("11 ") ? "all'" : "al ";
  // Solo il giorno dove l'ora al minuto è rumore (richiesta aperta del
  // cliente, docs/CHANGELOG.md §349).
  if (options.withTime === false) return `${dayArticle}${day}`;
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const timeArticle = time.startsWith("01:") ? "all'" : "alle ";
  return `${dayArticle}${day} ${timeArticle}${time}`;
}
