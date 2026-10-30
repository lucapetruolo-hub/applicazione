import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage } from "@/components/LegalPage";
import { BRAND, COMPANY } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Note legali",
  description: `Chi gestisce ${BRAND.name}, come contattarci e dove trovare termini e privacy.`,
  alternates: { canonical: "/note-legali" },
};

/**
 * Note legali in un solo posto (collaudo del 29/10/2026, M-01 e M-10):
 * dati della società (D.Lgs. 70/2003 art. 7, c.c. art. 2250) e punto di
 * contatto per utenti e autorità con le lingue (DSA artt. 11-12). I dati
 * arrivano da `COMPANY` in packages/shared/src/brand.ts, da compilare prima
 * del lancio.
 */
export default function NoteLegaliPage() {
  return (
    <LegalPage
      title="Note legali"
      updatedAt="30 ottobre 2026"
      sections={[
        {
          heading: "1. Chi gestisce il sito",
          body: `${BRAND.name} è gestito da:`,
          after: (
            <LegalList
              items={[
                {
                  title: COMPANY.legalName,
                  rows: [
                    ["Sede legale", COMPANY.address],
                    ["P.IVA e codice fiscale", COMPANY.vatNumber],
                    ["Registro delle imprese", COMPANY.rea],
                    ["PEC", COMPANY.pec],
                  ],
                },
              ]}
            />
          ),
        },
        {
          heading: "2. Come contattarci",
          body: `Per assistenza scrivi a ${BRAND.supportEmail} o dalla pagina Contatti; per i tuoi dati personali a ${COMPANY.privacyEmail}. Rispondiamo in italiano e in inglese.`,
        },
        {
          heading: "3. Punto di contatto per le autorità",
          body: `Le autorità degli Stati dell'Unione europea, la Commissione europea e il Comitato europeo per i servizi digitali ci scrivono a ${COMPANY.pec} o a ${BRAND.supportEmail} (Regolamento UE 2022/2065, art. 11), in italiano o in inglese. Lo stesso indirizzo vale per chi usa il sito (art. 12).`,
        },
        {
          heading: "4. Regole e informative",
          body: (
            <>
              <Link href="/termini">Termini di Servizio</Link>, <Link href="/privacy">Privacy Policy</Link>, <Link href="/cookie">Cookie Policy</Link> e{" "}
              <Link href="/accessibilita">Accessibilità</Link>. Per segnalare un contenuto illegale usa{" "}
              <Link href="/contatti?motivo=segnalazione">Segnala un contenuto illegale</Link>, anche senza account.
            </>
          ),
        },
      ]}
    />
  );
}
