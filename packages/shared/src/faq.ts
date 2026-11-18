/**
 * Domande frequenti: fonte unica per `/faq`, la home, `/per-professionisti`
 * e `/per-professionisti/pagamenti` (richiesta di Luca del 16/11/2026, da 8 a
 * circa 55 risposte divise tra clienti e professionisti,
 * docs/changelog/2026-11-16-domande-frequenti.md). Qui e non in `apps/web`
 * perché domani le stesse risposte possono servire anche ad altro (app,
 * email, un aiuto dentro il sito) senza riscriverle.
 *
 * Regole delle risposte: solo fatti già decisi e in funzione, presi dai
 * Termini, da `/problemi-e-rimborsi` e dal codice (numeri dalle costanti, mai
 * scritti a mano); italiano semplice, due o tre frasi, il dettaglio dietro
 * "Scopri di più". Il sito è un intermediario (CLAUDE.md §5 punto 18): mai
 * "garantiamo", mai prezzi decisi da noi, mai come si esegue un lavoro.
 */
import { BAD_WORK_REPORT_DAYS, JOB_ISSUE_PRO_REPLY_HOURS } from "./jobIssues";
import { MAX_CHOSEN_PROFESSIONALS, MAX_PROFESSIONAL_CATEGORIES } from "./limits";
import { ONLINE_LIMIT_EUR_CENTS, ONLINE_LIMIT_FREE_DAYS, ONLINE_LIMIT_FREE_JOBS } from "./onlineLimit";
import { ONLINE_APP_FEE_PERCENT, ONLINE_DEPOSIT_PERCENT, ONLINE_RELEASE_DAYS } from "./onlinePayments";
import { MAX_AWAY_DAYS } from "./away";
import { PAST_DUE_GRACE_DAYS, SUBSCRIPTION_TIERS } from "./plans";
import { FAQ_HOME, type FaqAudience, type FaqItem } from "./faqHome";

export type { FaqAudience, FaqItem } from "./faqHome";

/** Argomenti in ordine di pagina, per ciascun pubblico. */
export const FAQ_TOPICS: Record<FaqAudience, readonly string[]> = {
  cliente: ["Come funziona", "Pagamenti", "Annullare e problemi", "Fiducia e sicurezza", "Il tuo account"],
  professionista: ["Iscrizione e profilo", "Richieste e preventivi", "Agenda e clienti", "Abbonamento", "Pagamenti e documenti"],
};

const euro = (cents: number) => `${(cents / 100).toLocaleString("it-IT")} €`;
const tier = (name: "BASE" | "PLUS" | "PRO") => SUBSCRIPTION_TIERS.find((t) => t.tier === name)!;
const BASE = tier("BASE");
const PLUS = tier("PLUS");
const PRO = tier("PRO");

export const FAQ: readonly FaqItem[] = [
  // ——— Clienti: come funziona ———
  ...FAQ_HOME,
  {
    id: "come-chiedere",
    audience: "cliente",
    topic: "Come funziona",
    question: "Come chiedo un preventivo?",
    answer: `Scrivi il problema con parole tue, o fai una foto, e scegli la città. Ti mostriamo i professionisti adatti della zona: puoi sceglierne fino a ${MAX_CHOSEN_PROFESSIONALS} o mandare la richiesta a tutti. I preventivi arrivano nella tua area e ti avvisiamo per email.`,
  },
  {
    id: "quale-professionista",
    audience: "cliente",
    topic: "Come funziona",
    question: "Non so che professionista mi serve. Come faccio?",
    answer:
      "Descrivi il problema come lo diresti a voce, per esempio \"perde il rubinetto della cucina\". Ti suggeriamo noi il mestiere giusto e puoi sempre cambiarlo prima di inviare.",
  },
  {
    id: "urgente",
    audience: "cliente",
    topic: "Come funziona",
    question: "Ho un'urgenza: come faccio?",
    answer:
      "Usa la richiesta urgente: è gratuita e arriva subito ai professionisti della tua zona, segnata come urgente. Rispondono quelli disponibili in quel momento.",
    more: "/urgente",
  },
  {
    id: "quanti-preventivi",
    audience: "cliente",
    topic: "Come funziona",
    question: "Quanti preventivi riceverò?",
    answer:
      "Dipende da quanti professionisti sono liberi nella tua zona: ognuno decide se rispondere. Ti avvisiamo a ogni preventivo nuovo e la richiesta resta aperta per qualche giorno.",
  },
  {
    id: "chi-decide-prezzo",
    audience: "cliente",
    topic: "Come funziona",
    question: "Chi decide il prezzo?",
    answer:
      "Sempre il professionista, nel suo preventivo. Noi non fissiamo i prezzi. Nel preventivo trovi le voci una per una (manodopera, materiali, uscita) e i modi di pagamento che accetta.",
  },
  {
    id: "cambiare-professionista",
    audience: "cliente",
    topic: "Come funziona",
    question: "Posso cambiare professionista dopo aver ricevuto il preventivo?",
    answer: "Sì, senza costi né obblighi. Finché non accetti un preventivo sei libero.",
  },
  {
    id: "contatti-cliente",
    audience: "cliente",
    topic: "Come funziona",
    question: "Il professionista vede subito il mio telefono e il mio indirizzo?",
    answer:
      "No. Li vede solo quando accetti il suo preventivo. Prima vede la città, la descrizione, le foto e la vostra chat. Fino ad allora in chat non si possono mandare numeri, email o link, per nessuno dei due.",
  },
  {
    id: "salvare-professionista",
    audience: "cliente",
    topic: "Come funziona",
    question: "Posso salvare un professionista per dopo?",
    answer: "Sì: tocca \"Salva\" sulla sua scheda o sul profilo e lo ritrovi in Professionisti salvati, nella tua area.",
  },

  // ——— Clienti: pagamenti ———
  {
    id: "come-pago",
    audience: "cliente",
    topic: "Pagamenti",
    question: "Come pago il lavoro?",
    answer:
      "Nel preventivo il professionista indica come accetta di essere pagato: online con carta o direttamente a lui. Scegli tu quando accetti il preventivo.",
    answerWithoutOnline: "Paghi direttamente il professionista, nel modo che concordate. Il sito non trattiene nulla dal tuo pagamento.",
  },
  {
    id: "online-o-diretto",
    audience: "cliente",
    topic: "Pagamenti",
    question: "Meglio pagare online o direttamente?",
    answer: `Online i soldi restano fermi ${ONLINE_RELEASE_DAYS} giorni dopo il lavoro e, se qualcosa va storto e la segnalazione è accolta, ti rimborsiamo. Con il pagamento diretto non teniamo soldi e non decidiamo: vi mettiamo in contatto in chat per trovare un accordo.`,
    onlineOnly: true,
    more: "/problemi-e-rimborsi#pagamento-diretto",
  },
  {
    id: "acconto",
    audience: "cliente",
    topic: "Pagamenti",
    question: "Cos'è l'acconto?",
    answer: `È la parte che paghi online quando accetti il preventivo: è una percentuale del prezzo minimo del preventivo, scelta dal professionista (${ONLINE_DEPOSIT_PERCENT}% se non la indica). Il lavoro è confermato quando l'acconto è pagato; il resto, il saldo, si paga a lavoro finito.`,
    onlineOnly: true,
  },
  {
    id: "pagamento-sicuro",
    audience: "cliente",
    topic: "Pagamenti",
    question: "Pagare online è sicuro?",
    answer:
      "Paghi con carta tramite Stripe, uno dei più grandi servizi di pagamento: i dati della carta non passano da noi. Sull'estratto conto compare il professionista, perché il pagamento va sul suo conto.",
    onlineOnly: true,
  },
  {
    id: "prezzo-finale-piu-alto",
    audience: "cliente",
    topic: "Pagamenti",
    question: "Il prezzo finale può essere più alto del preventivo?",
    answer:
      "Il professionista deve motivare ogni voce aggiunta o differenza dal preventivo, e la vedi prima di pagare il saldo. Se non sei d'accordo puoi segnalarlo.",
  },
  {
    id: "fattura-cliente",
    audience: "cliente",
    topic: "Pagamenti",
    question: "Chi mi fa la fattura o la ricevuta?",
    answer:
      "Il professionista, perché il lavoro lo fai fare a lui. Puoi chiedergliela con \"Chiedi la fattura\" dalla scheda del lavoro: gli arrivano i dati che servono.",
  },

  // ——— Clienti: annullare e problemi ———
  {
    id: "annullare",
    audience: "cliente",
    topic: "Annullare e problemi",
    question: "Posso annullare un appuntamento?",
    answer:
      "Sì, dalla scheda del lavoro fino all'orario d'inizio. Un acconto pagato online ti torna per intero, salvo che annulli dentro il preavviso scritto nel preventivo e il professionista abbia scelto di trattenerlo: lo vedi prima di accettare.",
    answerWithoutOnline: "Sì, dalla scheda del lavoro fino all'orario d'inizio. Il professionista riceve subito l'avviso.",
    more: "/problemi-e-rimborsi#prima-del-lavoro",
  },
  {
    id: "non-si-presenta",
    audience: "cliente",
    topic: "Annullare e problemi",
    question: "Cosa succede se il professionista non si presenta?",
    answer:
      "Se hai pagato online ti rimborsiamo l'acconto e con un tasto mandi la stessa richiesta ad altri professionisti della zona. Se hai scelto il pagamento diretto, ti mettiamo in contatto con il professionista per trovare un accordo.",
    answerWithoutOnline:
      "Puoi segnalarlo e con un tasto mandi la stessa richiesta ad altri professionisti della zona. Per il pagamento ti mettiamo in contatto con il professionista per trovare un accordo.",
    more: "/problemi-e-rimborsi#non-si-presenta",
  },
  {
    id: "lavoro-fatto-male",
    audience: "cliente",
    topic: "Annullare e problemi",
    question: "Cosa succede se il lavoro non è fatto bene?",
    answer: `Hai ${BAD_WORK_REPORT_DAYS} giorni dalla fine del lavoro per segnalarlo, con una foto, finché non confermi che è terminato. Il professionista ha ${JOB_ISSUE_PRO_REPLY_HOURS} ore per proporti una soluzione; se hai pagato online e non vi accordate decide il nostro team e, se la segnalazione è accolta, ti rimborsiamo.`,
    answerWithoutOnline: `Hai ${BAD_WORK_REPORT_DAYS} giorni dalla fine del lavoro per segnalarlo, con una foto, finché non confermi che è terminato. Il professionista ha ${JOB_ISSUE_PRO_REPLY_HOURS} ore per proporti una soluzione in chat.`,
    more: "/problemi-e-rimborsi#lavoro-fatto-male",
  },
  {
    id: "dopo-i-7-giorni",
    audience: "cliente",
    topic: "Annullare e problemi",
    question: `Cosa succede se scopro un problema dopo i ${BAD_WORK_REPORT_DAYS} giorni o dopo aver confermato il lavoro?`,
    answer:
      "Puoi ancora segnalarlo al professionista dalla scheda del lavoro: lo riceve in chat. Non c'è più il rimborso dal sito, ma per legge il professionista risponde comunque dei difetti del suo lavoro.",
    more: "/problemi-e-rimborsi#dopo-i-7-giorni",
  },
  {
    id: "contestare-banca",
    audience: "cliente",
    topic: "Annullare e problemi",
    question: "Posso contestare il pagamento con la mia banca?",
    answer:
      "Sì, sempre. Ti conviene però segnalare prima il problema qui: è più veloce e la banca chiede comunque le prove. Durante la contestazione i soldi restano fermi finché la banca non decide.",
    onlineOnly: true,
    more: "/problemi-e-rimborsi#banca",
  },

  // ——— Clienti: fiducia e sicurezza ———
  {
    id: "verificato",
    audience: "cliente",
    topic: "Fiducia e sicurezza",
    question: "Cosa vuol dire \"Verificato\" sul profilo?",
    answer:
      "Che abbiamo controllato l'identità del professionista con un documento e un selfie. Esperienza, qualifiche e assicurazione invece le scrive lui, e ne risponde lui.",
  },
  {
    id: "recensioni-vere",
    audience: "cliente",
    topic: "Fiducia e sicurezza",
    question: "Le recensioni sono vere?",
    answer:
      "Può scriverle solo chi ha fatto un lavoro con quel professionista tramite il sito. Se una recensione ha segnali sospetti, per esempio lo stesso telefono del professionista, la controlla una persona prima di pubblicarla.",
  },
  {
    id: "lasciare-recensione",
    audience: "cliente",
    topic: "Fiducia e sicurezza",
    question: "Come lascio una recensione?",
    answer:
      "Quando il professionista ha segnato il lavoro come finito, la scrivi dalla scheda del lavoro, con le stelle e, se vuoi, le foto. Il professionista può rispondere pubblicamente.",
  },
  {
    id: "ordine-risultati",
    audience: "cliente",
    topic: "Fiducia e sicurezza",
    question: "Come è ordinato l'elenco dei professionisti?",
    answer:
      "Cercando per mestiere e città vengono prima i profili con l'etichetta \"Sponsorizzato\", poi la valutazione più alta, il numero di recensioni e la vicinanza. Quando parti dalla descrizione del problema gli sponsorizzati non contano.",
    more: "/termini#professionisti",
  },
  {
    id: "truffe",
    audience: "cliente",
    topic: "Fiducia e sicurezza",
    question: "Mi è arrivato un messaggio strano a nome del sito. Cosa faccio?",
    answer:
      "Non aprire il link e non dare mai dati della carta, password o codici ricevuti per SMS: noi non li chiediamo. Entra dal sito scrivendo tu l'indirizzo e, nel dubbio, scrivici.",
    more: "/sicurezza",
  },
  {
    id: "segnalare-contenuto",
    audience: "cliente",
    topic: "Fiducia e sicurezza",
    question: "Come segnalo un profilo, una foto o una recensione illegale?",
    answer: "Dalla pagina Contatti, con \"Segnala un contenuto illegale\": servono il link del contenuto e il motivo. Ti confermiamo la presa in carico per email.",
    more: "/contatti?motivo=segnalazione",
  },

  // ——— Clienti: account ———
  {
    id: "password-dimenticata",
    audience: "cliente",
    topic: "Il tuo account",
    question: "Ho dimenticato la password.",
    answer: "Dalla pagina Accedi tocca \"Password dimenticata\": ti mandiamo per email un link per sceglierne una nuova.",
    more: "/password-dimenticata",
  },
  {
    id: "notifiche",
    audience: "cliente",
    topic: "Il tuo account",
    question: "Come scelgo quali email e notifiche ricevere?",
    answer:
      "Dalla pagina Notifiche della tua area scegli argomento per argomento. Restano sempre attivi solo i messaggi su account e sicurezza, perché servono a proteggerti.",
    more: "/account/notifiche",
  },
  {
    id: "eliminare-account",
    audience: "cliente",
    topic: "Il tuo account",
    question: "Come elimino il mio account?",
    answer:
      "Dalla pagina Account della tua area. Se hai appuntamenti fissati li annulliamo noi e avvisiamo il professionista, con le regole di sempre su preavviso e acconto. Dopo la chiusura teniamo solo i dati che la legge ci obbliga a conservare.",
    more: "/privacy",
  },

  // ——— Professionisti: iscrizione e profilo ———
  {
    id: "pro-quanto-costa",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "Quanto costa?",
    answer: `Iscriversi è gratis. Per ricevere lavori c'è un abbonamento con tutte le funzioni, che cambia solo per i lavori compresi: ${BASE.label} ${euro(BASE.priceEurCents)} (${BASE.monthlyAcceptedJobs} lavori), ${PLUS.label} ${euro(PLUS.priceEurCents)} (${PLUS.monthlyAcceptedJobs}), ${PRO.label} ${euro(PRO.priceEurCents)} (senza limite), al mese + IVA.`,
    more: "/per-professionisti",
  },
  {
    id: "mesi-gratis",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "Come funzionano i {mesi} gratis?",
    answer: `Il livello Base è gratis per {mesi}, a partire dal lancio del sito. Per attivarli aggiungi la carta: oggi non paghi nulla e alla fine parte Base a ${euro(BASE.priceEurCents)} + IVA al mese, in automatico, con un avviso qualche giorno prima. Annulli quando vuoi. Se ti servono più lavori puoi passare a Plus o Pro anche durante i mesi gratis: paghi il primo mese meno ${euro(BASE.priceEurCents)}, e i mesi gratis che restano ti aspettano se torni a Base.`,
    founderOffer: true,
  },
  {
    id: "senza-partita-iva",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "Posso iscrivermi senza partita IVA?",
    answer:
      "Sì, scegliendo \"Lavoro occasionale\". A lavoro finito trovi una ricevuta già compilata, che controlli, numeri e firmi come documento tuo. Per limiti e tasse chiedi al tuo commercialista.",
  },
  {
    id: "quanti-mestieri",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "Quanti mestieri posso scegliere?",
    answer: `Da 1 a ${MAX_PROFESSIONAL_CATEGORIES}. Ricevi le richieste di quei mestieri nella tua zona. Nel profilo puoi aggiungere anche i singoli servizi che fai, con un prezzo indicativo: aiutano i clienti a trovarti.`,
  },
  {
    id: "verifica-identita",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "Perché devo fare la verifica con documento e selfie?",
    answer:
      "Serve prima del primo preventivo e richiede circa 2 minuti dal telefono. Dà al tuo profilo il bollino \"Verificato\", che i clienti vedono. Finché non la fai compari dopo chi l'ha già fatta.",
    more: "/dashboard/verifica-identita",
  },
  {
    id: "profilo-non-compare",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "Perché il mio profilo non compare nella ricerca?",
    answer:
      "Per comparire servono i dati fiscali compilati e un profilo non in pausa: dal lancio, la carta per i mesi gratis o un abbonamento attivo. Anche un codice fiscale o una partita IVA risultati non validi tolgono il profilo finché non li correggi.",
    more: "/dashboard/fiscale",
  },
  {
    id: "link-personale",
    audience: "professionista",
    topic: "Iscrizione e profilo",
    question: "I miei clienti di sempre contano nei lavori del mese?",
    answer:
      "No, se ti scrivono dal tuo link personale. Lo trovi nella tua area, con il codice QR da stampare e un messaggio pronto da mandare su WhatsApp. La richiesta arriva solo a te e il lavoro non conta, anche quando hai finito i lavori del mese. Vale per i clienti nuovi sul sito: chi ti aveva già trovato con la ricerca resta un cliente arrivato dal sito.",
    more: "/dashboard/il-tuo-link",
  },

  // ——— Professionisti: richieste e preventivi ———
  {
    id: "come-arrivano-richieste",
    audience: "professionista",
    topic: "Richieste e preventivi",
    question: "Come mi arrivano le richieste?",
    answer:
      "Ricevi le richieste dei clienti della tua zona per i tuoi mestieri, e quelle dei clienti che scelgono proprio te. Ti avvisiamo subito sul sito e per email: in un lavoro locale chi risponde per primo spesso viene scelto.",
    more: "/dashboard/richieste",
  },
  {
    id: "pro-contatti",
    audience: "professionista",
    topic: "Richieste e preventivi",
    question: "Quando vedo i contatti del cliente?",
    answer: "Quando il cliente accetta il tuo preventivo. Prima vedi la città, la descrizione del lavoro, le foto e la vostra chat.",
  },
  {
    id: "numero-in-chat",
    audience: "professionista",
    topic: "Richieste e preventivi",
    question: "Perché non posso mandare il mio numero in chat?",
    answer:
      "Prima dell'accettazione un messaggio con telefono, email, link o \"WhatsApp\" non parte, per nessuno dei due. È la stessa regola per tutti: protegge i clienti e fa sì che i lavori trovati qui passino dal preventivo.",
  },
  {
    id: "come-fare-preventivo",
    audience: "professionista",
    topic: "Richieste e preventivi",
    question: "Come faccio un preventivo?",
    answer:
      "Dalla richiesta scrivi le voci una per una (manodopera, materiali, uscita) con il prezzo, quando puoi venire e come accetti di essere pagato. Il prezzo lo decidi sempre tu. Il cliente può confrontarlo con gli altri preventivi ricevuti.",
  },
  {
    id: "cosa-conta-come-lavoro",
    audience: "professionista",
    topic: "Richieste e preventivi",
    question: "Quando un lavoro conta nell'abbonamento?",
    answer:
      "Quando il cliente accetta il tuo preventivo, non quando lo mandi. I lavori ripartono da zero a ogni rinnovo. Su Plus e Pro più lavori allo stesso cliente nello stesso mese contano come uno.",
  },
  {
    id: "limite-lavori",
    audience: "professionista",
    topic: "Richieste e preventivi",
    question: "Cosa succede se arrivo al limite di lavori del mio livello?",
    answer:
      "Ti avvisiamo prima. Resti nelle ricerche e ricevi le richieste; per mandare preventivi nuovi passi al livello sopra o aspetti il rinnovo, quando i lavori ripartono. I preventivi già mandati restano validi.",
    detail:
      "Passando al livello sopra paghi 10 € più la differenza di prezzo per i giorni che mancano al rinnovo, maggiorata del 10% (+ IVA). Su Plus e Pro più lavori allo stesso cliente nello stesso mese contano come uno.",
  },

  // ——— Professionisti: agenda e clienti ———
  {
    id: "pausa",
    audience: "professionista",
    topic: "Agenda e clienti",
    question: "Posso fermarmi per qualche giorno?",
    answer: `Sì, con "Metti in pausa" in Agenda, fino a ${MAX_AWAY_DAYS} giorni: non ricevi nuove richieste e non compari nella ricerca. I lavori già fissati restano e torni quando vuoi con "Riprendi ora".`,
    more: "/dashboard/agenda",
  },
  {
    id: "promemoria",
    audience: "professionista",
    topic: "Agenda e clienti",
    question: "Il cliente riceve un promemoria dell'appuntamento?",
    answer:
      "Sì, per email circa 24 ore prima, con i pulsanti \"Ci sarò\" e \"Non posso più\": così sai in anticipo se qualcosa cambia. Il cliente può spegnere questi avvisi dalle sue notifiche.",
  },
  {
    id: "calendario-telefono",
    audience: "professionista",
    topic: "Agenda e clienti",
    question: "Posso vedere gli appuntamenti nel calendario del telefono?",
    answer: "Sì: in Agenda tocca \"Collega al tuo calendario\" e aggiungi il link al calendario di Google o dell'iPhone. Gli appuntamenti si aggiornano da soli.",
    more: "/dashboard/agenda",
  },
  {
    id: "chi-recensisce",
    audience: "professionista",
    topic: "Agenda e clienti",
    question: "Chi può lasciarmi una recensione?",
    answer: "Solo un cliente che ha prenotato un lavoro con te sul sito.",
  },
  {
    id: "rispondere-recensione",
    audience: "professionista",
    topic: "Agenda e clienti",
    question: "Posso rispondere a una recensione?",
    answer:
      "Sì, pubblicamente, sotto ogni recensione. Una risposta calma e precisa aiuta chi legge a farsi un'idea.",
    more: "/dashboard/recensioni",
  },

  // ——— Professionisti: abbonamento ———
  {
    id: "prezzi-iva",
    audience: "professionista",
    topic: "Abbonamento",
    question: "I prezzi comprendono l'IVA?",
    answer: "No: sono IVA esclusa e l'IVA del 22% si aggiunge in fattura. Sotto ogni prezzo trovi anche il totale con l'IVA.",
  },
  {
    id: "annullare-abbonamento",
    audience: "professionista",
    topic: "Abbonamento",
    question: "Posso annullare l'abbonamento?",
    answer: "Sì, quando vuoi dalla pagina Abbonamento. Resta attivo fino alla fine del mese o dell'anno già pagato.",
    more: "/dashboard/abbonamento",
  },
  {
    id: "pagamento-non-riuscito",
    audience: "professionista",
    topic: "Abbonamento",
    question: "Cosa succede se il pagamento dell'abbonamento non va?",
    answer: `Ti avvisiamo per aggiornare la carta. Dopo un giorno il profilo va in pausa finché il pagamento non passa; dopo ${PAST_DUE_GRACE_DAYS} giorni l'abbonamento si chiude.`,
    more: "/dashboard/abbonamento",
  },

  // ——— Professionisti: pagamenti e documenti ———
  {
    id: "come-vengo-pagato",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "Come vengo pagato dai clienti?",
    answer: "Il cliente sceglie se pagarti online con carta o direttamente a te, tra i modi che indichi nel preventivo.",
    answerWithoutOnline: "Ti paga direttamente il cliente, nel modo che concordate.",
    more: "/per-professionisti/pagamenti",
  },
  {
    id: "commissione-online",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "Quanto trattenete sui pagamenti online?",
    answer: `Il ${ONLINE_APP_FEE_PERCENT}% + IVA di quanto pagato online, tutto compreso: dentro ci sono anche i costi della carta e del bonifico. Sui pagamenti diretti non tratteniamo nulla.`,
    onlineOnly: true,
    more: "/per-professionisti/pagamenti",
  },
  {
    id: "quando-arriva-bonifico",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "Quando arriva il bonifico?",
    answer: `Quando il cliente conferma che il lavoro è finito, oppure ${ONLINE_RELEASE_DAYS} giorni dopo la chiusura se non segnala problemi. Da lì il bonifico arriva sulla tua banca in 1-4 giorni lavorativi.`,
    onlineOnly: true,
  },
  {
    id: "cliente-contesta",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "E se il cliente contesta?",
    answer: `Se segnala un problema sul sito, avete ${JOB_ISSUE_PRO_REPLY_HOURS} ore per accordarvi in chat; se non vi accordate decide il nostro team, dopo aver sentito anche te. Se invece contesta il pagamento con la sua banca, decide la banca: i soldi restano bloccati fino alla risposta e la commissione di Stripe per la contestazione è a tuo carico. Con il pagamento diretto la questione resta tra te e il cliente.`,
    onlineOnly: true,
  },
  {
    id: "limite-online",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "C'è un limite agli importi che posso chiedere online?",
    answer: `All'inizio sì: al massimo ${euro(ONLINE_LIMIT_EUR_CENTS)} a lavoro, finché non hai ${ONLINE_LIMIT_FREE_JOBS} lavori pagati online senza contestazioni e ${ONLINE_LIMIT_FREE_DAYS} giorni dal primo. Poi il limite si toglie da solo. Con il pagamento diretto non c'è limite.`,
    onlineOnly: true,
  },
  {
    id: "fatture-nostre",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "Che fatture ricevo dal sito?",
    answer:
      "Una per ogni pagamento dell'abbonamento e, se usi i pagamenti online, una al mese con le trattenute. Le trovi tutte in Fatture e documenti, con l'estratto del mese da girare al commercialista.",
    more: "/dashboard/documenti",
  },
  {
    id: "fattura-al-cliente",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "Chi fa la fattura al cliente?",
    answer:
      "Tu, con il tuo programma, perché il lavoro è tuo. Il sito non manda nulla all'Agenzia delle Entrate per conto tuo: ti passa solo i dati che il cliente indica per la fattura.",
  },
  {
    id: "dac7",
    audience: "professionista",
    topic: "Pagamenti e documenti",
    question: "Perché mi chiedete i dati fiscali?",
    answer:
      "Per legge (direttiva europea DAC7) le piattaforme online comunicano ogni anno all'Agenzia delle Entrate i dati di chi riceve compensi tramite loro. Senza i dati fiscali il profilo non compare nella ricerca.",
    more: "/dashboard/fiscale",
  },
];

/** Le domande di un pubblico, in ordine di argomento. */
export function faqForAudience(audience: FaqAudience): FaqItem[] {
  const topics = FAQ_TOPICS[audience];
  return FAQ.filter((item) => item.audience === audience).sort((a, b) => topics.indexOf(a.topic) - topics.indexOf(b.topic));
}

/** Le domande con questi `id`, nell'ordine dato (per la home e le pagine dei professionisti). */
export function faqByIds(ids: readonly string[]): FaqItem[] {
  return ids.map((id) => {
    const item = FAQ.find((faq) => faq.id === id);
    if (!item) throw new Error(`Domanda frequente sconosciuta: ${id}`);
    return item;
  });
}

/** "3 mesi" / "1 mese" al posto di `{mesi}` nelle domande dei mesi gratis. */
export function faqWithMonths(text: string, months: number | null): string {
  return text.replaceAll("{mesi}", months === 1 ? "1 mese" : `${months ?? 0} mesi`);
}

/** Testo senza maiuscole né accenti, per cercare tra le domande. */
export function normalizeFaqText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le tre domande sotto "Chi sei?" in Contatti (docs/changelog/2026-11-16-domande-frequenti.md).
 * Si cambiano solo approvando una proposta in Admin, partita dai "No" di
 * "Ti è stata utile?": mai da sole. Queste sono quelle di partenza.
 */
export const CONTACT_FAQ_COUNT = 3;
export const CONTACT_FAQ_DEFAULT: Record<FaqAudience, readonly string[]> = {
  cliente: ["annullare", "lavoro-fatto-male", "come-pago"],
  professionista: ["profilo-non-compare", "limite-lavori", "annullare-abbonamento"],
};
export type ContactFaqPicks = Record<FaqAudience, string[]>;

/** Può stare in Contatti: niente risposte che dipendono da pagamenti online o offerte accese. */
export function contactFaqEligible(item: FaqItem, audience: FaqAudience): boolean {
  return item.audience === audience && !item.onlineOnly && !item.founderOffer;
}

/** Le domande salvate se valgono ancora (tre, esistenti, del pubblico giusto), altrimenti quelle di partenza. */
export function contactFaqOrDefault(audience: FaqAudience, ids: readonly string[] | null | undefined): string[] {
  const valid = (ids ?? []).filter((id, i, all) => all.indexOf(id) === i && FAQ.some((item) => item.id === id && contactFaqEligible(item, audience)));
  return valid.length === CONTACT_FAQ_COUNT ? valid : [...CONTACT_FAQ_DEFAULT[audience]];
}
