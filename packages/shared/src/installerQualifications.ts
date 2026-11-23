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

/**
 * Prestazioni da suggerire per prime a chi spunta un'abilitazione (richiesta
 * di Luca, docs/changelog/2026-11-23-termoidraulico.md): con la lettera A
 * l'elettricista può rilasciare la dichiarazione di conformità.
 */
export const SERVICES_BY_QUALIFICATION: Partial<Record<InstallerQualification, { category: ProfessionalCategorySlug; services: readonly string[] }>> = {
  a: { category: "elettricista", services: ["Certificazione impianto"] },
};

/** Prestazioni suggerite dalle abilitazioni spuntate per un mestiere. */
export function qualificationServicesFor(letters: readonly string[], categorySlug: ProfessionalCategorySlug): string[] {
  return letters.flatMap((letter) => {
    const entry = SERVICES_BY_QUALIFICATION[letter as InstallerQualification];
    return entry && entry.category === categorySlug ? [...entry.services] : [];
  });
}

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

/**
 * Registro nazionale F-gas (Camere di Commercio, DPR 146/2018 e regolamento
 * UE 2024/573): chi installa, ricarica o ripara condizionatori, pompe di calore
 * e frigoriferi deve esserci iscritto. Il professionista scrive il numero, il
 * cliente lo controlla da sé sulla ricerca pubblica (richiesta di Luca,
 * docs/changelog/2026-11-23-termoidraulico.md): mai "verificato" da noi.
 */
export const FGAS_REGISTRY_SEARCH_URL = "https://www.fgas.it/Ricerca";
export const FGAS_CATEGORIES: readonly ProfessionalCategorySlug[] = ["climatizzazione", "elettrodomestici"];
export const FGAS_NUMBER_MAX_LENGTH = 40;

export function hasFgasCategory(categorySlugs: readonly ProfessionalCategorySlug[]): boolean {
  return categorySlugs.some((slug) => FGAS_CATEGORIES.includes(slug));
}

/** Il numero da salvare: solo con un mestiere che tocca i gas fluorurati, vuoto = nessuno. */
export function validFgasNumber(value: string | null | undefined, categorySlugs: readonly ProfessionalCategorySlug[]): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed && hasFgasCategory(categorySlugs) ? trimmed : null;
}
