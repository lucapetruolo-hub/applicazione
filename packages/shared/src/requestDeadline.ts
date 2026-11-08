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

/**
 * Ora di una scadenza vicina, detta come la si dice a voce (collaudo dell'8/11,
 * E6-11): "le 18:05" oggi, "domani alle 9:30", "il 12 novembre alle 9:30".
 * Ora italiana.
 */
export function formatClockDeadline(value: Date | string, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const dayKey = (d: Date) => d.toLocaleDateString("it-IT", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Rome" });
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  if (dayKey(date) === dayKey(now)) return `le ${time}`;
  if (dayKey(date) === dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return `domani alle ${time}`;
  return `${formatItalianUntil(date).replace(/^al(l')? ?/, (m) => (m === "all'" ? "l'" : "il "))}`;
}
