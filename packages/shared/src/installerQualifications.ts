/**
 * Abilitazioni degli impianti del DM 37/2008, art. 1 comma 2 (richiesta di
 * Luca, docs/changelog/2026-11-23-termoidraulico.md): il professionista spunta
 * le lettere scritte nella sua visura camerale, il cliente le vede sul profilo
 * come dichiarate da lui (mai "verificate"). Solo le lettere dei mestieri del
 * sito: f (ascensori) e g (antincendio) non riguardano nessuna categoria.
 */

import type { ProfessionalCategorySlug } from "./categories";

export const INSTALLER_QUALIFICATIONS = [
  { letter: "a", label: "Impianti elettrici", short: "elettrici" },
  { letter: "b", label: "Antenne, citofoni ed elettronica", short: "antenne ed elettronica" },
  { letter: "c", label: "Riscaldamento, clima e canne fumarie", short: "riscaldamento e clima" },
  { letter: "d", label: "Impianti dell'acqua e sanitari", short: "acqua e sanitari" },
  { letter: "e", label: "Impianti del gas", short: "gas" },
] as const;

export type InstallerQualification = (typeof INSTALLER_QUALIFICATIONS)[number]["letter"];

export const INSTALLER_QUALIFICATION_LETTERS = INSTALLER_QUALIFICATIONS.map((item) => item.letter) as [InstallerQualification, ...InstallerQualification[]];

/**
 * Lettere che hanno senso per ciascun mestiere: il termoidraulico (Idraulico +
 * Climatizzazione e caldaie) vede c, d, e. Stessi confini del dizionario dei
 * problemi (`problemMatch.ts`): tubi del gas all'idraulico, caldaia a gas a
 * Climatizzazione, quindi la lettera e sta in tutti e due.
 */
const LETTERS_BY_CATEGORY: Partial<Record<ProfessionalCategorySlug, readonly InstallerQualification[]>> = {
  elettricista: ["a", "b"],
  climatizzazione: ["c", "e"],
  idraulico: ["d", "e"],
};

/** Abilitazioni da proporre per i mestieri scelti, in ordine di lettera. */
export function installerQualificationsFor(categorySlugs: readonly ProfessionalCategorySlug[]): (typeof INSTALLER_QUALIFICATIONS)[number][] {
  const allowed = new Set(categorySlugs.flatMap((slug) => LETTERS_BY_CATEGORY[slug] ?? []));
  return INSTALLER_QUALIFICATIONS.filter((item) => allowed.has(item.letter));
}

/** Tiene solo le lettere dei mestieri scelti, senza doppioni e in ordine. */
export function validInstallerQualifications(letters: readonly string[], categorySlugs: readonly ProfessionalCategorySlug[]): InstallerQualification[] {
  const chosen = new Set(letters);
  return installerQualificationsFor(categorySlugs)
    .filter((item) => chosen.has(item.letter))
    .map((item) => item.letter);
}

/** "riscaldamento e clima, acqua e sanitari e gas" per il profilo pubblico. */
export function installerQualificationsText(letters: readonly string[]): string {
  const parts = INSTALLER_QUALIFICATIONS.filter((item) => letters.includes(item.letter)).map((item) => item.short);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
