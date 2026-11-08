import type { Metadata } from "next";
import ContattiContent from "./ContattiContent";
import { BRAND } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Contatti",
  description: `Scrivici per qualsiasi domanda su ${BRAND.name}: ti rispondiamo il prima possibile.`,
  alternates: { canonical: "/contatti" },
};

/**
 * Pagina "Contatti" dedicata (richiesta esplicita dell'utente, con
 * screenshot di riferimento MioDottore), raggiungibile dal link
 * "Contatti" dentro la colonna "Servizi" del footer. `ContattiContent` è
 * un componente client separato: renderizzare Tamagui direttamente in
 * questo Server Component fallisce in build ("createContext is not a
 * function"), stesso gotcha già documentato altrove nel progetto
 * (es. /faq, /password-dimenticata).
 *
 * `?motivo=segnalazione` (link "Segnala un contenuto illegale" del footer,
 * docs/CHANGELOG.md §319) apre il modulo già sulla segnalazione.
 * `?motivo=aiuto-profilo` ("Preferisci farti aiutare al telefono?" su
 * /per-professionisti) lo apre come professionista con il messaggio già
 * avviato: lo stesso modulo, nessuna strada a parte
 * (docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md).
 */
export default async function ContattiPage({ searchParams }: { searchParams: Promise<{ motivo?: string | string[] }> }) {
  const { motivo } = await searchParams;
  return <ContattiContent initialReport={motivo === "segnalazione"} initialProfileHelp={motivo === "aiuto-profilo"} />;
}
