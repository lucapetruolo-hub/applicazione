import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSummary } from "@/components/LegalPage";
import { BAD_WORK_REPORT_DAYS, BRAND, JOB_ISSUE_PRO_REPLY_HOURS, NO_SHOW_REPORT_DAYS } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Problemi e rimborsi",
  description: `Cosa succede su ${BRAND.name} se un lavoro va storto: annullamenti, professionista che non si presenta, lavoro fatto male, rimborsi e garanzia.`,
  alternates: { canonical: "/problemi-e-rimborsi" },
};

/**
 * Una sola pagina che spiega cosa fare quando qualcosa va storto, in ordine
 * di tempo (richiesta di Luca del 30/10/2026, docs/changelog/2026-10-30-collaudo-soldi-online.md):
 * le Domande frequenti e "Segnala un problema" rimandano qui con un'ancora.
 * Il testo che vale resta nei Termini (punti 5 e 6).
 */
export default function ProblemiERimborsiPage() {
  return (
    <LegalPage
      title="Problemi e rimborsi"
      updatedAt="30 ottobre 2026"
      intro={
        <LegalSummary
          points={[
            `Prima del lavoro puoi annullare: l'acconto pagato online ti torna, salvo che annulli dentro il preavviso indicato nel preventivo.`,
            `Se il professionista non si presenta o il lavoro non va bene, segnalalo entro ${BAD_WORK_REPORT_DAYS} giorni e prima di confermare che è terminato.`,
            `Se hai pagato online e non vi accordate decide il nostro team e, se hai ragione, ti rimborsa il professionista.`,
            "Dopo i 7 giorni puoi ancora scrivere al professionista: niente rimborso dal sito, ma resta la garanzia di legge.",
          ]}
        />
      }
      sections={[
        {
          id: "prima-del-lavoro",
          heading: "Prima del lavoro: annullare",
          body: (
            <>
              Puoi annullare l&apos;appuntamento dalla scheda del lavoro fino all&apos;orario d&apos;inizio. Se hai pagato un acconto online ti torna per
              intero sulla carta, ripreso dal conto del professionista. Solo se annulli dentro il preavviso scritto nel preventivo (per esempio 24 o 48
              ore prima) e il professionista ha scelto di trattenerlo, l&apos;acconto resta a lui: lo vedi prima di accettare. Se annulla il
              professionista, l&apos;acconto ti torna sempre. Un appuntamento annullato si riapre solo se siete d&apos;accordo entrambi. Se sei un
              consumatore hai anche il diritto di recesso (<Link href="/termini#recesso">Termini, punto 11</Link>).
            </>
          ),
        },
        {
          id: "non-si-presenta",
          heading: "Il giorno dell'appuntamento: il professionista non si presenta",
          body: `Dalla fine dell'appuntamento, entro ${NO_SHOW_REPORT_DAYS} giorni, apri la scheda del lavoro e scegli "Segnala un problema". Il professionista ha ${JOB_ISSUE_PRO_REPLY_HOURS} ore per risponderti; se hai pagato online e la segnalazione è accolta ti rimborsiamo quanto pagato. Con un tasto mandi la stessa richiesta ad altri professionisti della zona.`,
        },
        {
          id: "lavoro-fatto-male",
          heading: `Nei ${BAD_WORK_REPORT_DAYS} giorni: il lavoro non va bene`,
          body: `Hai ${BAD_WORK_REPORT_DAYS} giorni dalla fine del lavoro per segnalarlo, con almeno una foto, finché non confermi che è terminato: la conferma vale come accettazione del lavoro. Il professionista ha ${JOB_ISSUE_PRO_REPLY_HOURS} ore per risponderti in chat e proporti una soluzione, per esempio tornare a sistemare o restituirti una parte del prezzo: se te la propone online, la accetti con un tocco e il rimborso parte subito. Se hai pagato online e non vi accordate, o se lui non risponde, decide il nostro team dopo aver sentito entrambi: se hai ragione ti rimborsiamo tutto, metà o una parte di quanto pagato, secondo la gravità. In questi giorni i soldi pagati online restano fermi e il professionista non li riceve.`,
        },
        {
          id: "dopo-i-7-giorni",
          heading: `Dopo i ${BAD_WORK_REPORT_DAYS} giorni o dopo la conferma`,
          body: `I soldi pagati online arrivano al professionista ${BAD_WORK_REPORT_DAYS} giorni dopo il lavoro, o prima se confermi che è terminato: da quel momento non possiamo più rimborsarti né decidere noi. Puoi però ancora segnalare un difetto, per 2 anni, da "Segnala un problema": descrivi il problema con le foto e il professionista lo riceve in chat. Per legge il professionista risponde comunque dei difetti del suo lavoro, e conviene segnalarli appena li scopri perché la legge fissa termini brevi: il messaggio in chat resta scritto, con la data. Se non vi accordate chiudi la segnalazione dalla scheda del lavoro: puoi lasciare la recensione o, se l'avevi già lasciata, aggiornarla una volta. Resta sempre possibile rivolgersi a un organismo di mediazione, a un'associazione dei consumatori o al giudice.`,
        },
        {
          id: "pagamento-diretto",
          heading: "Se hai pagato direttamente il professionista",
          body: "Con il pagamento diretto non teniamo soldi e non decidiamo: ti mettiamo in contatto con il professionista in chat per trovare un accordo, e puoi sempre lasciare la recensione. Per avere la nostra assistenza e il rimborso scegli il pagamento online quando accetti il preventivo.",
        },
        {
          id: "banca",
          heading: "Contestare il pagamento con la tua banca",
          body: "Puoi sempre contestare un pagamento con carta presso la tua banca, ma ti conviene prima segnalare il problema qui: la segnalazione è più veloce e la banca chiede comunque le prove. Durante una contestazione i soldi restano fermi finché la banca non decide.",
        },
        {
          id: "regole",
          heading: "Le regole complete",
          body: (
            <>
              Questa pagina è una spiegazione semplice: le regole che valgono sono nei <Link href="/termini">Termini di Servizio</Link>, punti 5
              (pagamenti) e 6 (segnalazioni). Per qualunque dubbio <Link href="/contatti">scrivici</Link>.
            </>
          ),
        },
      ]}
    />
  );
}
