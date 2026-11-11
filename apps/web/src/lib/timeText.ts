/**
 * Orari scritti a mano nei campi ora del sito (ItalianTimeInput,
 * docs/changelog/2026-11-10-campo-orario-scrivibile.md): si accettano i modi
 * in cui una persona scrive un'ora ("9", "930", "9.30", "9,30", "9 30",
 * "0930", "14:5") e si riportano sempre a "HH:MM".
 */

const pad = (n: number) => String(n).padStart(2, "0");

function valid(h: number, m: number): string | null {
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;
}

/** Ora "HH:MM" da quello che la persona ha scritto, o null se non si capisce. */
export function parseTypedTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/^ore\s*/, "");
  if (!t) return null;
  // Con un separatore: "9:30", "9.30", "9,30", "9 30", "9h30". Un solo
  // numero dopo il separatore vale le decine ("9:3" = 09:30), come si legge.
  const sep = t.match(/^(\d{1,2})\s*[:.,h\s]\s*(\d{0,2})$/);
  if (sep) {
    const minutes = sep[2] ?? "";
    const m = minutes.length === 0 ? 0 : minutes.length === 1 ? Number(minutes) * 10 : Number(minutes);
    return valid(Number(sep[1]), m);
  }
  if (!/^\d{1,4}$/.test(t)) return null;
  if (t.length <= 2) return valid(Number(t), 0);
  if (t.length === 4) return valid(Number(t.slice(0, 2)), Number(t.slice(2)));
  // Tre cifre: "930" = 09:30, "130" = 01:30; se così non è un'ora, "093" = 09:30 e "160" = 16:00.
  return valid(Number(t[0]), Number(t.slice(1))) ?? valid(Number(t.slice(0, 2)), Number(t[2]) * 10);
}

/**
 * Testo mentre si scrive: i due punti si mettono da soli appena l'ora è
 * sicura ("1430" → "14:30", "930" → "9:30"); il resto si sistema all'uscita.
 */
export function formatWhileTyping(raw: string): string {
  if (/[:.,h ]/i.test(raw)) {
    const m = raw.match(/^\s*(\d{0,2})\s*[:.,h ]\s*(\d{0,2})/i);
    return m ? `${m[1]}:${m[2]}` : raw.replace(/[^\d:]/g, "").slice(0, 5);
  }
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  if (d.length === 3 && Number(d[0]) >= 3) return `${d[0]}:${d.slice(1)}`;
  return d;
}

/**
 * Ora completa e senza dubbi mentre si scrive, da passare subito alla pagina
 * (così l'ora di fine si aggiorna come prima): "14:30", "9:30", "1430", "930".
 */
export function completeTypedTime(text: string): string | null {
  if (!/^\d{1,2}:\d{2}$/.test(text) && !/^\d{4}$/.test(text)) return null;
  return parseTypedTime(text);
}

/** Sposta un'ora "HH:MM" di `minutes` minuti, girando sulle 24 ore. */
export function shiftTime(value: string, minutes: number): string {
  const parsed = parseTypedTime(value) ?? "09:00";
  const [h, m] = parsed.split(":").map(Number) as [number, number];
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
