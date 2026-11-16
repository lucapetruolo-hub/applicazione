import type { Metadata } from "next";
import ContattiContent from "./ContattiContent";
import { BRAND, CONTACT_FAQ_DEFAULT, type ContactFaqPicks } from "@professionisti/shared";
import { API_URL } from "@/lib/apiUrl";

export const metadata: Metadata = {
  title: "Contatti",
  description: `Scrivici per qualsiasi domanda su ${BRAND.name}: ti rispondiamo il prima possibile.`,
  alternates: { canonical: "/contatti" },
};

// Le tre domande sotto "Chi sei?": cambiano solo approvando una proposta in
// Admin, quindi bastano 10 minuti di cache. Senza API, quelle di partenza.
async function loadContactFaq(): Promise<ContactFaqPicks> {
  try {
    const res = await fetch(`${API_URL}/site/contact-faq`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(3000) });
    if (res.ok) return (await res.json()) as ContactFaqPicks;
  } catch {
    // API addormentata: si mostrano quelle di partenza.
  }
  return { cliente: [...CONTACT_FAQ_DEFAULT.cliente], professionista: [...CONTACT_FAQ_DEFAULT.professionista] };
}

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
  const [{ motivo }, faqPicks] = await Promise.all([searchParams, loadContactFaq()]);
  return <ContattiContent initialReport={motivo === "segnalazione"} initialProfileHelp={motivo === "aiuto-profilo"} faqPicks={faqPicks} />;
}
