import type { Metadata } from "next";
import FaqContent from "./FaqContent";

export const metadata: Metadata = {
  title: "Domande frequenti",
  description:
    "Le domande più comuni su come funziona Professionisti — costi, registrazione, cosa succede se qualcosa va storto durante un intervento.",
};

/**
 * Pagina FAQ dedicata — richiesta esplicita dell'utente: "Cosa succede
 * se..." (§34) non deve più comparire direttamente in home, va spostato
 * "dentro FAQ", raggiungibile dal footer sotto "Per i clienti". Riusa gli
 * stessi due componenti accordion già esistenti (`HomeFaq`, le domande
 * generali già mostrate in home; `WhatIfSection`, spostato qui) invece di
 * duplicarne il contenuto — nessuna nuova fonte di testo. `FaqContent`
 * è un componente client separato: renderizzare Tamagui direttamente in
 * questo Server Component fallisce in build ("createContext is not a
 * function"), stesso gotcha già documentato altrove nel progetto (es.
 * /password-dimenticata).
 */
export default function FaqPage() {
  return <FaqContent />;
}
