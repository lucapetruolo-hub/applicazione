import type { Metadata } from "next";
import ContattiContent from "./ContattiContent";

export const metadata: Metadata = {
  title: "Contatti",
  description: "Scrivici per qualsiasi domanda su Professionisti: ti rispondiamo il prima possibile.",
};

/**
 * Pagina "Contatti" dedicata (richiesta esplicita dell'utente, con
 * screenshot di riferimento MioDottore), raggiungibile dal link
 * "Contatti" dentro la colonna "Servizi" del footer. `ContattiContent` è
 * un componente client separato: renderizzare Tamagui direttamente in
 * questo Server Component fallisce in build ("createContext is not a
 * function"), stesso gotcha già documentato altrove nel progetto
 * (es. /faq, /password-dimenticata).
 */
export default function ContattiPage() {
  return <ContattiContent />;
}
