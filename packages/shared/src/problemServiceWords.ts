import { POPULAR_SERVICES, type ProfessionalCategorySlug } from "./categories";

/**
 * Parole dei clienti che portano a una prestazione suggerita
 * (docs/changelog/2026-11-06-dizionario-prestazioni.md, richiesta di Luca):
 * così il dizionario, quando è sicuro del mestiere, indica anche la
 * prestazione e nei risultati vanno prima i professionisti che la offrono,
 * senza chiedere all'intelligenza artificiale. Ogni parola vale come inizio
 * di parola, come nel dizionario dei mestieri; vince la prima voce che trova.
 * La prestazione deve essere scritta come in `POPULAR_SERVICES` (lo
 * controlla `problemServiceWords.test.ts`).
 */
export const SERVICE_WORDS: readonly { category: ProfessionalCategorySlug; service: string; words: readonly string[] }[] = [
  // Idraulico
  { category: "idraulico", service: "Sturatura scarichi", words: ["intasat", "otturat", "ingorg", "sturar", "sturat", "disostru", "scorre lento", "lento a scaricare", "non scarica", "rigurgit"] },
  { category: "idraulico", service: "Sostituzione sifone", words: ["sifon", "piletta"] },
  { category: "idraulico", service: "Sostituzione rubinetteria", words: ["rubinett", "miscelator", "monocomando", "soffione", "deviator"] },
  { category: "idraulico", service: "Riparazione cassetta WC", words: ["sciacquon", "cassetta wc", "cassetta del wc", "cassetta incassata", "tirare l acqua", "tiro l acqua", "vaschetta"] },
  { category: "idraulico", service: "Trasformazione vasca in doccia", words: ["vasca in doccia", "trasformare la vasca", "trasformazione vasca", "trasformazione della vasca", "togliere la vasca", "al posto della vasca"] },
  { category: "idraulico", service: "Installazione caldaia", words: ["nuova caldai", "caldaia nuova", "installare la caldai", "installare una caldai", "sostituire la caldai", "cambiare la caldai", "installazione caldai", "sostituzione caldai", "sostituzione della caldai"] },
  { category: "idraulico", service: "Sostituzione box doccia", words: ["box doccia", "piatto doccia", "cabina doccia"] },
  { category: "idraulico", service: "Installazione scaldabagno", words: ["installare lo scaldabagn", "nuovo scaldabagn", "montare lo scaldabagn", "installazione scaldabagn"] },
  { category: "idraulico", service: "Ricerca perdite e infiltrazioni", words: ["infiltraz", "macchia di umid", "macchie di umid", "ricerca perdit", "perdita nascost", "piano di sotto", "vicino di sotto", "allag"] },
  { category: "idraulico", service: "Installazione lavatrice e lavastoviglie", words: ["attacco lavatric", "allacciare la lavatric", "collegare la lavatric", "installare la lavatric", "allacciare la lavastovigli", "collegare la lavastovigli", "installare la lavastovigli"] },
  { category: "idraulico", service: "Riparazione perdita d'acqua", words: ["perdita d acqua", "perde acqua", "perde", "perdit", "gocciol", "tubo rotto", "tubo che perde"] },
  // Elettricista
  { category: "elettricista", service: "Ricerca guasti (salvavita che scatta)", words: ["salvavit", "differenzial", "magnetotermic", "salta la corrente", "salta corrente", "saltata la corrente", "va via la corrente", "senza corrente", "manca la corrente", "scatta"] },
  { category: "elettricista", service: "Sostituzione prese e interruttori", words: ["presa", "prese", "interruttor", "deviator", "placchett"] },
  { category: "elettricista", service: "Installazione punti luce", words: ["lampadar", "plafonier", "punti luce", "punto luce", "faretto", "faretti", "applique"] },
  { category: "elettricista", service: "Installazione videocitofono", words: ["citofon", "videocitofon", "apriporta", "campanell"] },
  { category: "elettricista", service: "Sostituzione quadro elettrico", words: ["quadro elettric", "quadretto"] },
  { category: "elettricista", service: "Certificazione impianto", words: ["certificaz", "dichiarazione di conformit", "di conformita"] },
  { category: "elettricista", service: "Automazione cancelli", words: ["cancello elettric", "cancello automatic", "fotocellul", "automazione cancell", "motore del cancell"] },
  { category: "elettricista", service: "Motorizzazione tapparelle", words: ["tapparella elettric", "tapparelle elettric", "motorizzare le tapparell", "motore della tapparell", "motore tapparell"] },
  // Imbianchino
  { category: "imbianchino", service: "Trattamento antimuffa", words: ["muffa", "antimuffa"] },
  { category: "imbianchino", service: "Tinteggiatura esterni", words: ["facciata", "esterni", "esterne", "esterno della casa", "pareti esterne", "muri esterni"] },
  { category: "imbianchino", service: "Tinteggiatura soffitti", words: ["soffitto", "soffitti"] },
  { category: "imbianchino", service: "Stuccatura crepe", words: ["crepa", "crepe", "stuccat", "buchi nel muro", "fori nel muro"] },
  { category: "imbianchino", service: "Verniciatura infissi", words: ["verniciare gli infissi", "verniciare le persiane", "verniciare le finestre", "riverniciare gli infissi", "riverniciare le persiane", "infissi", "persiane"] },
  { category: "imbianchino", service: "Rasatura pareti", words: ["rasar", "rasatur"] },
  { category: "imbianchino", service: "Decorazioni pareti", words: ["stucco veneziano", "decoraz", "carta da parati", "parati"] },
  { category: "imbianchino", service: "Tinteggiatura interni", words: ["tinteggi", "imbianc", "pitturar", "ridipinger", "dare il bianco", "camera", "stanza", "appartamento"] },
  // Pulizie
  { category: "pulizie", service: "Pulizie di fine cantiere", words: ["fine cantiere", "fine lavori", "post ristrutturazione", "dopo la ristrutturazione", "dopo i lavori", "terminato la ristrutturazione"] },
  { category: "pulizie", service: "Pulizie post-trasloco", words: ["trasloco", "trasferiment", "prima di entrare", "casa nuova"] },
  { category: "pulizie", service: "Sanificazione ambienti", words: ["sanificaz", "igienizz", "disinfett"] },
  { category: "pulizie", service: "Pulizie di ufficio", words: ["ufficio", "uffici", "studio", "negozio", "condominio"] },
  { category: "pulizie", service: "Pulizie settimanali", words: ["settimanal", "ogni settimana", "a settimana", "colf", "donna delle pulizie", "signora delle pulizie"] },
  { category: "pulizie", service: "Pulizia profonda di cucina e bagno", words: ["pulizia a fondo", "pulire a fondo", "pulizia profonda", "pulizia approfondita", "calcare", "sgrassar"] },
  { category: "pulizie", service: "Pulizia vetri", words: ["vetri", "vetrate", "finestre"] },
  // Giardiniere
  { category: "giardiniere", service: "Potatura siepi", words: ["siepe", "siepi", "potar", "potatur"] },
  { category: "giardiniere", service: "Taglio erba", words: ["erba", "tagliaerba", "rasaerba", "sfalci", "falciare"] },
  { category: "giardiniere", service: "Rimozione alberi", words: ["abbatter", "abbattimento", "tagliare un albero", "tagliare l albero", "rimuovere un albero"] },
  { category: "giardiniere", service: "Rimozione ceppi", words: ["ceppo", "ceppi", "radici"] },
  { category: "giardiniere", service: "Impianto di irrigazione", words: ["irrigaz", "irrigator"] },
  { category: "giardiniere", service: "Semina e rifacimento prato", words: ["seminar", "prato nuovo", "rifare il prato", "prato a rotoli"] },
  // Traslochi
  { category: "traslochi", service: "Sgombero cantine e appartamenti", words: ["sgomber", "svuotar", "svuota cantin"] },
  { category: "traslochi", service: "Trasloco lunga distanza", words: ["altra citta", "altra regione", "lunga distanza", "dall estero", "all estero"] },
  { category: "traslochi", service: "Trasloco locale", words: ["trasloc", "trasferiment", "trasferisc"] },
  { category: "traslochi", service: "Trasporto con montacarichi", words: ["montacarichi", "autoscala"] },
  { category: "traslochi", service: "Trasporto singoli mobili", words: ["divano", "divani", "materass", "un mobile", "singolo mobile"] },
  { category: "traslochi", service: "Smontaggio e montaggio mobili", words: ["smontaggio e montaggio", "smontare e rimontare", "smontare e montare"] },
  { category: "traslochi", service: "Imballaggio oggetti", words: ["imball"] },
  // Fabbro
  { category: "fabbro", service: "Apertura porte bloccate", words: ["chiuso fuori", "chiusa fuori", "rimasto fuori", "rimasta fuori", "apertura porta", "aprire la porta", "porta bloccata", "chiavi dentro"] },
  { category: "fabbro", service: "Sostituzione cilindro europeo", words: ["cilindr", "doppia mappa", "defender"] },
  { category: "fabbro", service: "Sostituzione serratura", words: ["serratur", "furto", "scasso"] },
  { category: "fabbro", service: "Riparazione porte blindate", words: ["porta blindata", "blindat"] },
  { category: "fabbro", service: "Duplicazione chiavi", words: ["duplicat", "copia della chiave", "copia delle chiavi"] },
  { category: "fabbro", service: "Riparazione grate", words: ["inferriat", "grata", "grate"] },
  { category: "fabbro", service: "Installazione cancelli", words: ["cancell", "ringhier", "recinzion"] },
  // Climatizzazione e caldaie
  { category: "climatizzazione", service: "Installazione pompa di calore", words: ["pompa di calore", "pompe di calore"] },
  { category: "climatizzazione", service: "Installazione caldaia", words: ["nuova caldai", "caldaia nuova", "installare la caldai", "installare una caldai", "sostituire la caldai", "cambiare la caldai", "installazione caldai", "sostituzione caldai", "sostituzione della caldai"] },
  { category: "climatizzazione", service: "Ricarica gas condizionatore", words: ["non raffredda", "ricarica gas", "ricarica del gas", "aria calda dal condizionator", "aria calda dal climatizzator"] },
  { category: "climatizzazione", service: "Pulizia filtri condizionatore", words: ["filtri", "filtro", "puzza dal condizionator", "odore dal condizionator", "sanificazione del condizionator"] },
  { category: "climatizzazione", service: "Installazione condizionatore", words: ["installare il condizionator", "installare un condizionator", "installare il climatizzator", "installare un climatizzator", "nuovo condizionator", "nuovo climatizzator", "split"] },
  { category: "climatizzazione", service: "Controllo fumi caldaia", words: ["controllo fumi", "analisi fumi", "bollino", "libretto"] },
  { category: "climatizzazione", service: "Manutenzione caldaia", words: ["manutenzione caldai", "revisione caldai", "pulizia caldai", "tagliando"] },
  { category: "climatizzazione", service: "Riparazione scaldabagno", words: ["scaldabagn", "boiler", "scaldaacqua"] },
  { category: "climatizzazione", service: "Sostituzione termostato", words: ["termostat", "cronotermostat"] },
  { category: "climatizzazione", service: "Riparazione caldaia", words: ["caldai", "bruciator", "acqua calda", "pressione della caldai", "va in blocco"] },
  // Muratore
  { category: "muratore", service: "Trasformazione vasca in doccia", words: ["vasca in doccia", "trasformare la vasca", "trasformazione vasca", "trasformazione della vasca", "togliere la vasca", "al posto della vasca"] },
  { category: "muratore", service: "Ristrutturazione bagno", words: ["rifare il bagno", "ristrutturare il bagno", "ristrutturazione del bagno", "ristrutturazione bagno"] },
  { category: "muratore", service: "Ristrutturazione cucina", words: ["rifare la cucina", "ristrutturare la cucina", "ristrutturazione della cucina", "ristrutturazione cucina"] },
  { category: "muratore", service: "Realizzazione cartongesso", words: ["cartongesso", "controsoffitt", "parete divisoria"] },
  { category: "muratore", service: "Demolizioni", words: ["demoli", "abbattere un muro", "abbattere una parete", "buttare giu"] },
  { category: "muratore", service: "Impermeabilizzazione terrazzi e balconi", words: ["impermeabilizz", "lastrico", "terrazz", "balcon", "guaina"] },
  { category: "muratore", service: "Risanamento umidità e infiltrazioni", words: ["umidita", "risalita", "infiltraz", "efflorescenz"] },
  { category: "muratore", service: "Rifacimento fughe", words: ["fughe", "fuga"] },
  { category: "muratore", service: "Posa piastrelle", words: ["piastrell", "mattonell", "rivestiment"] },
  { category: "muratore", service: "Rifacimento pavimenti", words: ["pavimento", "pavimenti", "pavimentaz", "massetto"] },
  { category: "muratore", service: "Riparazione crepe nei muri", words: ["crepa", "crepe", "cavillatur", "intonac", "sgretol"] },
  // Falegname
  { category: "falegname", service: "Mobili su misura", words: ["su misura", "cabina armadio"] },
  { category: "falegname", service: "Posa e riparazione parquet", words: ["parquet"] },
  { category: "falegname", service: "Sostituzione infissi", words: ["sostituire gli infissi", "sostituire le finestre", "sostituzione infissi", "sostituzione finestre", "nuovi infissi", "nuove finestre", "cambiare le finestre", "cambiare gli infissi"] },
  { category: "falegname", service: "Riparazione finestre e persiane in legno", words: ["finestra", "finestre", "persiana", "persiane", "scuri", "infissi", "infisso"] },
  { category: "falegname", service: "Riparazione porte in legno", words: ["porta", "porte", "scrigno", "porta scorrevole", "cerniere"] },
  { category: "falegname", service: "Restauro mobili", words: ["restaur", "antico", "antica"] },
  { category: "falegname", service: "Montaggio mobili", words: ["montare", "montaggio"] },
  { category: "falegname", service: "Riparazione mobili", words: ["cassett", "anta", "ante", "armadio", "mobile", "tavolo", "sedia"] },
  // Tutto Fare
  { category: "tuttofare", service: "Montaggio mobili", words: ["ikea", "pax", "kallax", "billy"] },
  { category: "tuttofare", service: "Montaggio zanzariere", words: ["zanzarier"] },
  { category: "tuttofare", service: "Riparazione tapparelle", words: ["tapparell", "avvolgibil", "cinghia"] },
  { category: "tuttofare", service: "Montaggio tende e bastoni", words: ["tende", "tenda", "bastone", "bastoni", "binario"] },
  { category: "tuttofare", service: "Fissaggio a muro (mensole, quadri, TV)", words: ["mensol", "quadri", "quadro", "tv a muro", "televisore", "appendere", "fissare al muro", "staffa", "specchio"] },
  { category: "tuttofare", service: "Sigillatura con silicone (bagno e cucina)", words: ["silicon", "sigillar", "sigillatur"] },
  { category: "tuttofare", service: "Montaggio mobili", words: ["montare", "montaggio", "montarli", "assemblare"] },
  // Dogsitter
  { category: "dogsitter", service: "Passeggiata con il cane", words: ["passeggiat", "portare fuori il cane", "uscita con il cane", "dog walker", "dogwalker"] },
  { category: "dogsitter", service: "Pensione per cani", words: ["pensione", "tenerlo a casa tua", "ospitare il cane"] },
  { category: "dogsitter", service: "Accudimento durante le vacanze", words: ["vacanz", "ferie"] },
  { category: "dogsitter", service: "Accompagnamento dal veterinario", words: ["veterinari"] },
  { category: "dogsitter", service: "Visita a domicilio", words: ["dargli da mangiare", "dare da mangiare", "visita a domicilio", "passare a casa", "gatto", "gatti"] },
  // Babysitter
  { category: "babysitter", service: "Uscita da scuola e compiti", words: ["uscita da scuola", "prendere a scuola", "prenderli a scuola", "compiti", "doposcuola"] },
  { category: "babysitter", service: "Accudimento neonati", words: ["neonat", "pochi mesi"] },
  { category: "babysitter", service: "Babysitting serale", words: ["sera", "serale", "cena"] },
  { category: "babysitter", service: "Babysitting nel weekend", words: ["weekend", "fine settimana", "sabato", "domenica"] },
  { category: "babysitter", service: "Babysitting al mattino prima della scuola", words: ["mattino", "mattina", "prima della scuola", "accompagnare a scuola"] },
];

/**
 * La prestazione del mestiere dato a cui portano le parole del testo (già
 * passato da `normalizeProblemText`), o null. Vince la prima voce
 * dell'elenco, per questo in ogni mestiere le più precise stanno prima:
 * "cilindro" prima di "porta blindata", "ikea" prima di "montare".
 */
export function serviceFromWords(normalizedText: string, category: ProfessionalCategorySlug): string | null {
  const entry = SERVICE_WORDS.find((item) => item.category === category && item.words.some((word) => normalizedText.includes(` ${word}`)));
  return entry?.service ?? null;
}

/** Tutte le prestazioni di `SERVICE_WORDS` sono tra quelle suggerite del loro mestiere. */
export function serviceWordsAreSuggested(): boolean {
  return SERVICE_WORDS.every((entry) => POPULAR_SERVICES[entry.category].includes(entry.service));
}
