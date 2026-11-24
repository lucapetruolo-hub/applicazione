/**
 * Righe del riquadro "chi ha annullato e quando" sotto l'etichetta
 * "Annullata" (Luca, docs/changelog/2026-11-24-chi-ha-annullato-e-quando.md).
 * Una sola fonte per la scheda della richiesta e per l'Agenda.
 */
export type CanceledInfoInput = {
  canceledBy: "CLIENT" | "PROFESSIONAL" | null;
  /** ISO, null per i lavori annullati prima che si salvasse l'ora. */
  canceledAt: string | null;
  cancellationNote: string | null;
  /** Il cliente ha annullato dentro il preavviso (docs/CHANGELOG.md §347). */
  canceledLate: boolean;
};

export type CanceledInfoLines = { who: string; when: string | null; late: string | null; note: string | null };

/** Data e ora italiane, con l'anno solo se non è quello in corso. */
export function formatCanceledAt(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameYear = d.toLocaleDateString("it-IT", { year: "numeric", timeZone: "Europe/Rome" }) === now.toLocaleDateString("it-IT", { year: "numeric", timeZone: "Europe/Rome" });
  const day = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Europe/Rome" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} alle ${time}`;
}

/** Visto dal professionista. Null quando non sappiamo né chi né quando: l'etichetta resta com'è. */
export function canceledInfoForProfessional(input: CanceledInfoInput, label: "Annullata" | "Annullato"): CanceledInfoLines | null {
  if (!input.canceledBy && !input.canceledAt) return null;
  const who = input.canceledBy === "CLIENT" ? `${label} dal cliente` : input.canceledBy === "PROFESSIONAL" ? `${label} da te` : label;
  return {
    who,
    when: input.canceledAt ? formatCanceledAt(input.canceledAt) : null,
    late: input.canceledBy === "CLIENT" && input.canceledLate ? "Con meno preavviso di quello che chiedi" : null,
    note: input.cancellationNote?.trim() || null,
  };
}

/** Visto dal cliente in "Le mie richieste": stesse righe, dette dal suo lato. */
export function canceledInfoForClient(input: Omit<CanceledInfoInput, "canceledLate">): CanceledInfoLines | null {
  if (!input.canceledBy && !input.canceledAt) return null;
  const who = input.canceledBy === "PROFESSIONAL" ? "Annullata dal professionista" : input.canceledBy === "CLIENT" ? "Annullata da te" : "Annullata";
  return { who, when: input.canceledAt ? formatCanceledAt(input.canceledAt) : null, late: null, note: input.cancellationNote?.trim() || null };
}
