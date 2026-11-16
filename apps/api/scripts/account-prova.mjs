// Account di prova realistici (docs/changelog/2026-11-16-account-di-prova.md).
//
//   node apps/api/scripts/account-prova.mjs crea    -> toglie quelli di prima e li ricrea
//   node apps/api/scripts/account-prova.mjs togli   -> li elimina tutti, prima del lancio
//   node apps/api/scripts/account-prova.mjs elenco  -> mostra cosa c'è adesso
//
// Si lancia dalla Shell di Render (servizio API, usa il suo DATABASE_URL) o in
// locale dopo `pnpm --filter @professionisti/api build`. Tocca SOLO gli
// account con email `@prova.example.com` segnati "Account di prova"
// (User.testAccountAt): fuori da ogni numero (CLAUDE.md §5 punto 17) e, dal
// lancio, fuori dalla ricerca (publicVisibilityWhere). Dopo il LAUNCH_DATE
// "crea" si rifiuta (decisione di Luca del 16/11/2026).
//
// Tutto inventato: nomi, indirizzi, codici fiscali e partite IVA giusti solo
// nella forma, numeri di telefono con il prefisso 300 (non assegnato). Niente
// foto di persone, niente IBAN, niente Stripe: i pagamenti online e gli
// abbonamenti si provano dal sito con Stripe di prova. Nessun controllo
// Openapi (nessuna riga TaxIdCheck): niente costi e niente profili tolti dalla
// ricerca per un codice inventato.
import { createRequire } from "node:module";
import { randomInt, randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { prisma: prismaBase } = require("@professionisti/database");
// Stesso client dell'API: il codice fiscale si salva cifrato (docs/CHANGELOG.md §292).
let fiscalEncryptionExtension;
try {
  ({ fiscalEncryptionExtension } = require("../dist/common/fiscal-encryption.extension.js"));
} catch {
  console.error("Manca il build dell'API: lancia prima `pnpm --filter @professionisti/api build`.");
  process.exit(1);
}
const prisma = prismaBase.$extends(fiscalEncryptionExtension);
const shared = require("@professionisti/shared");
const bcrypt = require("bcryptjs");

export const DOMINIO_PROVA = "@prova.example.com";
// Il repo è pubblico: la password non sta qui. Si sceglie con PROVA_PASSWORD
// oppure se ne genera una a ogni "crea", stampata alla fine (uguale per tutti).
const PASSWORD = process.env.PROVA_PASSWORD?.trim() || `Prova-${randomInt(100000, 999999)}-${randomInt(1000, 9999)}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

// --- Città (tutta Italia; non Rieti, Viterbo e Ancona delle prove di carico) ---
const CITTA = {
  Milano: { lat: 45.4642, lng: 9.19, prov: "MI", cap: "20129", belfiore: "F205" },
  Torino: { lat: 45.0703, lng: 7.6869, prov: "TO", cap: "10128", belfiore: "L219" },
  Bologna: { lat: 44.4949, lng: 11.3426, prov: "BO", cap: "40127", belfiore: "A944" },
  Firenze: { lat: 43.7696, lng: 11.2558, prov: "FI", cap: "50133", belfiore: "D612" },
  Roma: { lat: 41.9028, lng: 12.4964, prov: "RM", cap: "00176", belfiore: "H501" },
  Napoli: { lat: 40.8518, lng: 14.2681, prov: "NA", cap: "80127", belfiore: "F839" },
  Bari: { lat: 41.1171, lng: 16.8719, prov: "BA", cap: "70126", belfiore: "A662" },
  Palermo: { lat: 38.1157, lng: 13.3615, prov: "PA", cap: "90144", belfiore: "G273" },
};

// --- Professionisti ---------------------------------------------------------
// stato: "completo" (in ricerca, verificato), "pausa", "nuovo" (appena iscritto,
// senza dati fiscali né verifica: resta fuori dalla ricerca quando i dati fiscali
// sono obbligatori).
const PROFESSIONISTI = [
  {
    chiave: "ferri", nome: "Marco", cognome: "Ferri", sesso: "M", nato: "1984-03-12", citta: "Milano", via: "Via Padova", civico: "118",
    attivita: "Idraulica Ferri", categoria: "idraulico", altre: ["climatizzazione"], tipo: "SOLE_PROPRIETOR", stato: "completo",
    anni: 16, assicurazione: true, raggio: 20, lingue: ["Italiano", "Inglese"], copertina: "idraulico",
    bio: "Idraulico a Milano da sedici anni. Mi occupo di perdite, scarichi otturati, sostituzione di rubinetti e sanitari, scaldabagni e caldaie a gas. Arrivo con il furgone attrezzato e, quando posso, risolvo al primo appuntamento. Preventivo chiaro prima di iniziare, niente sorprese a fine lavoro.",
    certificazioni: "Abilitazione DM 37/08 lettere C, D ed E; patentino F-gas",
    prestazioni: [["Riparazione perdita rubinetto o sifone", 60, 120, "JOB"], ["Sostituzione scaldabagno elettrico", 180, 320, "JOB"], ["Disotturazione scarico", 80, 150, "JOB"], ["Manutenzione caldaia", 90, 130, "JOB"], ["Intervento a ore", 35, 45, "HOUR"]],
    orari: [[1, "08:00", "12:30"], [1, "14:00", "18:00"], [2, "08:00", "12:30"], [2, "14:00", "18:00"], [3, "08:00", "12:30"], [4, "08:00", "12:30"], [4, "14:00", "18:00"], [5, "08:00", "13:00"]],
  },
  {
    chiave: "bianchi", nome: "Davide", cognome: "Bianchi", sesso: "M", nato: "1979-11-02", citta: "Torino", via: "Corso Francia", civico: "45",
    attivita: "Elettro Bianchi", categoria: "elettricista", altre: [], tipo: "SOLE_PROPRIETOR", stato: "completo",
    anni: 22, assicurazione: true, raggio: 25, lingue: ["Italiano"], copertina: "elettricista-2", online: true,
    bio: "Elettricista a Torino e prima cintura. Impianti civili nuovi e rifacimenti, quadri elettrici, prese e punti luce, ricerca guasti e certificazioni di conformità. Per i dubbi più semplici faccio anche una videochiamata prima di venire, così sappiamo già cosa serve.",
    certificazioni: "Abilitazione DM 37/08 lettere A e B",
    prestazioni: [["Ricerca guasto e ripristino", 70, 140, "JOB"], ["Nuovo punto luce o presa", 45, 80, "JOB"], ["Sostituzione quadro elettrico", 350, 700, "JOB"], ["Dichiarazione di conformità", 120, 250, "JOB"], ["Consulenza in videochiamata", 25, 25, "JOB"]],
    orari: [[1, "08:30", "17:30"], [2, "08:30", "17:30"], [3, "08:30", "17:30"], [4, "08:30", "17:30"], [5, "08:30", "16:00"]],
  },
  {
    chiave: "galli", nome: "Sara", cognome: "Galli", sesso: "F", nato: "1991-06-25", citta: "Bologna", via: "Via San Donato", civico: "73",
    attivita: "Sara Galli", categoria: "pulizie", altre: [], tipo: "PRIVATE_INDIVIDUAL", stato: "completo",
    anni: 6, assicurazione: false, raggio: 10, lingue: ["Italiano", "Spagnolo"], copertina: "pulizie",
    bio: "Faccio pulizie di casa a Bologna, anche con cadenza fissa ogni settimana o ogni due settimane. Porto io i prodotti se serve. Pulizie di fondo dopo un trasloco o prima di entrare in una casa nuova. Precisa e puntuale, lavoro da sola.",
    certificazioni: null,
    prestazioni: [["Pulizia ordinaria appartamento", 15, 18, "HOUR"], ["Pulizia di fondo dopo trasloco", 150, 280, "JOB"], ["Pulizia vetri e tapparelle", 60, 120, "JOB"], ["Stiratura", 14, 14, "HOUR"]],
    orari: [[1, "08:00", "13:00"], [2, "08:00", "13:00"], [3, "08:00", "13:00"], [3, "15:00", "18:00"], [4, "08:00", "13:00"], [5, "08:00", "13:00"], [6, "09:00", "12:00"]],
  },
  {
    chiave: "conti", nome: "Andrea", cognome: "Conti", sesso: "M", nato: "1975-01-30", citta: "Firenze", via: "Via Aretina", civico: "210",
    attivita: "Falegnameria Conti", categoria: "falegname", altre: ["tuttofare"], tipo: "SOLE_PROPRIETOR", stato: "completo",
    anni: 28, assicurazione: true, raggio: 30, lingue: ["Italiano"], copertina: "falegname",
    bio: "Bottega di falegnameria a Firenze dal 1998. Mobili su misura, riparazione e restauro di mobili antichi, porte interne, montaggio cucine e armadi. Vengo a prendere le misure a casa e porto un disegno prima di iniziare.",
    certificazioni: null,
    prestazioni: [["Montaggio cucina", 250, 500, "JOB"], ["Riparazione mobile o anta", 50, 120, "JOB"], ["Restauro mobile antico", 200, 900, "JOB"], ["Libreria su misura", 80, 120, "SQUARE_METER"], ["Regolazione porte interne", 40, 70, "JOB"]],
    orari: [[1, "08:00", "12:00"], [2, "08:00", "12:00"], [3, "08:00", "12:00"], [4, "08:00", "12:00"], [5, "08:00", "12:00"], [2, "15:00", "18:00"], [4, "15:00", "18:00"]],
  },
  {
    chiave: "ricci", nome: "Luigi", cognome: "Ricci", sesso: "M", nato: "1982-09-08", citta: "Roma", via: "Via Prenestina", civico: "301",
    attivita: "Ricci Decorazioni S.r.l.", categoria: "imbianchino", altre: ["muratore"], tipo: "BUSINESS", stato: "completo",
    anni: 14, assicurazione: true, raggio: 25, lingue: ["Italiano", "Inglese"], copertina: "imbianchino-2",
    bio: "Impresa di tinteggiature e decorazioni a Roma: tre squadre, cantieri puliti e tempi rispettati. Imbiancatura di appartamenti e uffici, stucchi veneziani, carta da parati, trattamenti antimuffa e piccoli lavori di muratura. Sopralluogo gratuito in città.",
    certificazioni: "Iscrizione alla Camera di Commercio di Roma",
    prestazioni: [["Imbiancatura stanza", 180, 350, "JOB"], ["Imbiancatura appartamento", 6, 10, "SQUARE_METER"], ["Trattamento antimuffa", 120, 300, "JOB"], ["Stucco veneziano", 25, 40, "SQUARE_METER"], ["Posa carta da parati", 15, 25, "SQUARE_METER"]],
    orari: [[1, "07:30", "16:30"], [2, "07:30", "16:30"], [3, "07:30", "16:30"], [4, "07:30", "16:30"], [5, "07:30", "16:30"], [6, "08:00", "12:00"]],
    societa: { ragione: "Ricci Decorazioni S.r.l.", forma: "SRL", rea: "RM-1587432" },
  },
  {
    chiave: "esposito", nome: "Gennaro", cognome: "Esposito", sesso: "M", nato: "1988-04-17", citta: "Napoli", via: "Via Arenaccia", civico: "54",
    attivita: "Il Verde di Gennaro", categoria: "giardiniere", altre: [], tipo: "SOLE_PROPRIETOR", stato: "pausa",
    anni: 10, assicurazione: true, raggio: 20, lingue: ["Italiano"], copertina: "giardiniere",
    bio: "Giardiniere a Napoli e provincia: taglio dell'erba, potature, siepi, impianti di irrigazione e cura di terrazzi e balconi. Contratti di manutenzione mensile per condomìni e ville.",
    certificazioni: "Patentino per l'uso dei prodotti fitosanitari",
    prestazioni: [["Taglio erba", 40, 120, "JOB"], ["Potatura siepe", 60, 200, "JOB"], ["Impianto di irrigazione", 300, 900, "JOB"], ["Manutenzione mensile giardino", 80, 160, "JOB"]],
    orari: [[1, "07:00", "13:00"], [2, "07:00", "13:00"], [3, "07:00", "13:00"], [4, "07:00", "13:00"], [5, "07:00", "13:00"]],
    pausa: "Fermo per qualche settimana: riprendo a dicembre.",
  },
  {
    chiave: "lorusso", nome: "Nicola", cognome: "Lorusso", sesso: "M", nato: "1980-12-05", citta: "Bari", via: "Viale Japigia", civico: "88",
    attivita: "Traslochi Lorusso", categoria: "traslochi", altre: [], tipo: "SOLE_PROPRIETOR", stato: "completo",
    anni: 18, assicurazione: true, raggio: 50, lingue: ["Italiano"], copertina: "traslochi",
    bio: "Traslochi in città, in Puglia e in tutta Italia. Smontaggio e rimontaggio mobili, imballaggio, piattaforma elevatrice e deposito temporaneo. Sopralluogo o videochiamata per il preventivo.",
    certificazioni: "Iscrizione all'Albo degli autotrasportatori",
    prestazioni: [["Trasloco monolocale in città", 300, 500, "JOB"], ["Trasloco appartamento in città", 600, 1200, "JOB"], ["Smontaggio e montaggio mobili", 30, 40, "HOUR"], ["Noleggio piattaforma elevatrice", 150, 250, "DAY"]],
    orari: [[1, "07:30", "18:00"], [2, "07:30", "18:00"], [3, "07:30", "18:00"], [4, "07:30", "18:00"], [5, "07:30", "18:00"], [6, "07:30", "13:00"]],
  },
  {
    chiave: "messina", nome: "Salvatore", cognome: "Messina", sesso: "M", nato: "1993-07-21", citta: "Palermo", via: "Via Ernesto Basile", civico: "16",
    attivita: "Salvatore Messina Fabbro", categoria: "fabbro", altre: [], tipo: null, stato: "nuovo",
    anni: null, assicurazione: false, raggio: 25, lingue: ["Italiano"], copertina: null,
    bio: null, certificazioni: null, prestazioni: [], orari: [],
  },
];

// --- Clienti ------------------------------------------------------------------
const CLIENTI = [
  { chiave: "moretti", nome: "Giulia", cognome: "Moretti", citta: "Milano", via: "Via Lomellina", civico: "21", tel: "+39 3000000101" },
  { chiave: "romano", nome: "Paolo", cognome: "Romano", citta: "Torino", via: "Via Nizza", civico: "150", tel: "+39 3000000102" },
  { chiave: "colombo", nome: "Chiara", cognome: "Colombo", citta: "Bologna", via: "Via Mazzini", civico: "62", tel: "+39 3000000103" },
  { chiave: "deluca", nome: "Francesca", cognome: "De Luca", citta: "Firenze", via: "Via Gioberti", civico: "34", tel: "+39 3000000104" },
  { chiave: "greco", nome: "Alessandro", cognome: "Greco", citta: "Roma", via: "Via Tuscolana", civico: "512", tel: "+39 3000000105" },
  { chiave: "marino", nome: "Elena", cognome: "Marino", citta: "Bari", via: "Via Fanelli", civico: "9", tel: "+39 3000000106" },
];

// --- Lavori passati con recensione: [professionista, cliente, giorni fa, voto, testo, risposta?]
const RECENSIONI = [
  ["ferri", "moretti", 95, 5, "Perdita sotto il lavello risolta in mezz'ora. Puntuale e molto pulito, ha anche controllato gli altri rubinetti senza farmeli pagare.", "Grazie Giulia, a disposizione per la caldaia in primavera!"],
  ["ferri", "romano", 70, 5, "Mi ha cambiato lo scaldabagno nella casa di mia madre a Milano. Preventivo rispettato al centesimo.", null],
  ["ferri", "colombo", 52, 4, "Lavoro fatto bene, è arrivato con venti minuti di ritardo ma ha avvisato.", "Mi scuso per il ritardo, c'era traffico in tangenziale. Grazie della fiducia."],
  ["ferri", "deluca", 31, 5, "Scarico della doccia otturato da mesi, finalmente risolto. Consigliatissimo.", null],
  ["ferri", "greco", 18, 5, "Gentile e veloce, mi ha spiegato come evitare che si ripeta.", null],
  ["bianchi", "romano", 120, 5, "Rifatto il quadro elettrico: lavoro ordinato e certificato consegnato subito.", "Grazie Paolo, buona serata!"],
  ["bianchi", "marino", 64, 4, "Ha trovato il guasto che altri due elettricisti non avevano trovato. Prezzo un po' alto ma giusto.", null],
  ["bianchi", "moretti", 22, 5, "La videochiamata prima di venire è stata comodissima: è arrivato già con il pezzo giusto.", null],
  ["galli", "colombo", 80, 5, "Sara è precisissima, la casa non è mai stata così pulita. Ormai viene ogni giovedì.", "Grazie Chiara!"],
  ["galli", "deluca", 40, 5, "Pulizia di fondo dopo il trasloco, impeccabile.", null],
  ["galli", "greco", 12, 4, "Brava e affidabile, consigliata.", null],
  ["conti", "deluca", 150, 5, "Ha restaurato la credenza della nonna: sembra nuova ma ha mantenuto il suo carattere. Un artigiano vero.", "È stato un piacere lavorare su un mobile così bello."],
  ["conti", "colombo", 90, 5, "Cucina montata in un giorno, tutto in bolla e pulito.", null],
  ["conti", "marino", 45, 4, "Libreria su misura bellissima, consegnata con una settimana di ritardo rispetto alla data detta.", "Ha ragione, il legno è arrivato in ritardo dal fornitore. Grazie della pazienza."],
  ["ricci", "greco", 110, 5, "Imbiancato tutto l'appartamento in tre giorni, mobili coperti e nessuna macchia in giro.", null],
  ["ricci", "romano", 60, 4, "Ottimo lavoro con l'antimuffa in bagno. Sopralluogo veloce e preventivo chiaro.", null],
  ["ricci", "moretti", 25, 5, "Stucco veneziano in salotto: risultato splendido.", "Grazie Giulia!"],
  ["esposito", "marino", 140, 5, "Siepe e prato sistemati alla perfezione.", null],
  ["esposito", "greco", 100, 4, "Puntuale e preciso.", null],
  ["lorusso", "marino", 75, 5, "Trasloco da Bari a Lecce senza un graffio. Squadra gentilissima.", "Grazie Elena, buona nuova casa!"],
  ["lorusso", "deluca", 35, 5, "Organizzati, veloci e il prezzo era quello del preventivo.", null],
];

// Richieste dei lavori passati, una dopo l'altra per ogni professionista: [testo, prestazione usata nel preventivo, m² se diversi da 35].
const PASSATI = {
  ferri: [["Perde il sifone sotto il lavello della cucina, gocciola anche a rubinetto chiuso.", 0], ["Lo scaldabagno elettrico non scalda più, ha circa quindici anni. Va sostituito?", 1], ["Il rubinetto del bagno gocciola e la manopola è dura da girare.", 0], ["Lo scarico della doccia è otturato, l'acqua resta nel piatto per minuti.", 2], ["Il lavandino del bagno scarica lentissimo e fa cattivo odore.", 2]],
  bianchi: [["Quadro elettrico vecchio, con i fusibili. Vorrei metterlo a norma con i salvavita.", 2], ["Da ieri non funzionano le prese della camera da letto, il resto della casa sì.", 0], ["Mi serve una presa nuova in cucina vicino al piano di lavoro per il forno a microonde.", 1]],
  galli: [["Cerco qualcuno per le pulizie di casa una volta a settimana, appartamento di 80 metri quadri.", 0], ["Pulizia di fondo di un bilocale appena lasciato dagli inquilini.", 1], ["Pulizia dei vetri e delle tapparelle di tutta la casa, sei finestre e una portafinestra.", 2]],
  conti: [["Ho una credenza degli anni Trenta da restaurare, ha il piano rovinato e un'anta che non chiude.", 2], ["Mi serve il montaggio di una cucina appena comprata, quattro metri lineari più l'isola.", 0], ["Vorrei una libreria su misura in una nicchia del soggiorno, circa due metri per due e mezzo.", 3, 5]],
  ricci: [["Imbiancatura di tutto l'appartamento, tre stanze più cucina e bagno, pareti e soffitti.", 1], ["In bagno c'è la muffa sul soffitto vicino alla finestra, torna ogni inverno.", 2], ["Vorrei lo stucco veneziano su una parete del salotto, circa dodici metri quadri.", 3, 12]],
  esposito: [["Siepe di alloro lunga venti metri da potare e prato da tagliare.", 1], ["Taglio dell'erba in un giardino di circa trecento metri quadri.", 0]],
  lorusso: [["Trasloco da Bari a Lecce, trilocale al secondo piano senza ascensore.", 1], ["Trasloco di un monolocale nello stesso quartiere, ho solo pochi mobili.", 0]],
};

async function main() {
  const azione = process.argv[2];
  if (!["crea", "togli", "elenco"].includes(azione ?? "")) {
    console.log("Uso: node apps/api/scripts/account-prova.mjs crea | togli | elenco");
    process.exitCode = 1;
    return;
  }
  if (azione === "elenco") return elenco();
  if (azione === "togli") return togli();
  const launch = launchDate(process.env.LAUNCH_DATE);
  if (launch && NOW >= launch) {
    console.error(`Il sito è lanciato (LAUNCH_DATE ${process.env.LAUNCH_DATE}): niente account di prova nuovi. Per toglierli: togli.`);
    process.exitCode = 1;
    return;
  }
  await togli();
  await crea();
}

/** Stessa regola di apps/api/src/subscriptions/subscription-rules.ts (launchDate). */
function launchDate(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00+01:00`) : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

const PROVA_WHERE = { email: { endsWith: DOMINIO_PROVA }, testAccountAt: { not: null } };

async function togli() {
  const utenti = await prisma.user.findMany({ where: PROVA_WHERE, select: { id: true, email: true, professionalProfile: { select: { id: true } } } });
  if (utenti.length === 0) {
    console.log("Nessun account di prova da togliere.");
    return;
  }
  const profili = utenti.map((u) => u.professionalProfile?.id).filter(Boolean);
  const ids = utenti.map((u) => u.id);
  // Come "Elimina account di prova" in Admin (admin.service deleteTestAccount): mai un account con soldi veri passati online.
  const pagati = await prisma.jobPayment.count({
    where: { depositPaidAt: { not: null }, stripePaymentIntentId: { not: null }, booking: { OR: [{ clientId: { in: ids } }, { professionalProfileId: { in: profili } }] } },
  });
  if (pagati > 0) console.log(`Attenzione: ${pagati} pagamenti online (Stripe di prova) collegati: li tolgo insieme agli account.`);
  await prisma.$transaction(async (tx) => {
    // Prima i lavori e le richieste che legano clienti e professionisti di prova
    // a chiunque, poi gli account: così nessun vincolo ferma l'eliminazione.
    const richieste = await tx.guidedRequest.findMany({ where: { OR: [{ clientId: { in: ids } }, { professionalProfileId: { in: profili } }] }, select: { id: true } });
    const bookings = await tx.booking.findMany({ where: { OR: [{ clientId: { in: ids } }, { professionalProfileId: { in: profili } }] }, select: { id: true } });
    const bookingIds = bookings.map((b) => b.id);
    await tx.review.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.jobPayment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await tx.guidedRequest.deleteMany({ where: { id: { in: richieste.map((r) => r.id) } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  }, { timeout: 60_000 });
  console.log(`Tolti ${utenti.length} account di prova (${profili.length} professionisti) con richieste, preventivi, lavori e recensioni.`);
}

async function elenco() {
  const utenti = await prisma.user.findMany({
    where: PROVA_WHERE,
    orderBy: [{ role: "desc" }, { email: "asc" }],
    select: { email: true, role: true, city: true, professionalProfile: { select: { businessName: true, pausedAt: true, verified: true } } },
  });
  if (utenti.length === 0) console.log("Nessun account di prova.");
  for (const u of utenti) {
    const p = u.professionalProfile;
    console.log(`${u.role === "PROFESSIONAL" ? "Professionista" : "Cliente"}  ${u.email}  ${u.city ?? ""}${p ? `  "${p.businessName}"${p.pausedAt ? " (in pausa)" : ""}${p.verified ? "" : " (non verificato)"}` : ""}`);
  }
}

async function crea() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const categorie = await categorieDb();
  const pro = new Map();
  const clienti = new Map();

  for (const p of PROFESSIONISTI) pro.set(p.chiave, await creaProfessionista(p, passwordHash, categorie));
  for (const c of CLIENTI) clienti.set(c.chiave, await creaCliente(c, passwordHash));

  // Lavori finiti con recensione (date nel passato, dal più vecchio).
  const usati = {};
  for (const [kp, kc, giorni, voto, testo, risposta] of RECENSIONI) {
    const n = (usati[kp] = (usati[kp] ?? -1) + 1);
    const [descrizione, indice, quantita] = PASSATI[kp][n % PASSATI[kp].length];
    await lavoro({ pro: pro.get(kp), cliente: clienti.get(kc), categorie, giorniFa: giorni, stato: "finito", voto, testo, risposta, descrizione, voci: [vocePreventivo(pro.get(kp).dati.prestazioni[indice], quantita)] });
  }

  // Storie in corso, una per cliente, per provare ogni schermata.
  const lead = (k) => pro.get(k);
  // 1) Giulia (Milano): richiesta appena mandata, Ferri non ha ancora risposto.
  await richiesta({ pro: lead("ferri"), cliente: clienti.get("moretti"), categorie, descrizione: "Il wc perde acqua alla base quando tiro lo sciacquone, si forma una pozza sul pavimento. Casa al terzo piano con ascensore.", fra: 3, stato: "attesa" });
  // 2) Paolo (Torino): preventivo ricevuto da Bianchi, da accettare, con chat.
  await richiesta({ pro: lead("bianchi"), cliente: clienti.get("romano"), categorie, descrizione: "Salta il differenziale quando accendo forno e lavatrice insieme. Impianto di circa vent'anni.", fra: 5, stato: "preventivo",
    chat: [["CLIENT", "Buongiorno, il problema c'è da una settimana, a volte anche solo con il forno."], ["PROFESSIONAL", "Buongiorno Paolo, probabilmente è il forno che disperde. Porto lo strumento per misurarlo e, se serve, cambio il differenziale. Le ho mandato il preventivo."]],
    voci: [["Ricerca guasto e misura dispersione", 70, 110], ["Sostituzione differenziale (se serve)", 0, 90]] });
  // 3) Chiara (Bologna): lavoro fissato con Sara fra 4 giorni, pagamento diretto.
  await lavoro({ pro: lead("galli"), cliente: clienti.get("colombo"), categorie, giorniFa: -4, stato: "fissato",
    descrizione: "Pulizia di fondo di un trilocale prima di entrarci: cucina, due bagni, vetri.", voci: [["Pulizia di fondo trilocale", 180, 240]] });
  // 4) Francesca (Firenze): lavoro fatto ieri, aspetta la conferma e la recensione.
  await lavoro({ pro: lead("conti"), cliente: clienti.get("deluca"), categorie, giorniFa: 1, stato: "da-confermare",
    descrizione: "Due ante della cucina non chiudono più bene e una cerniera è rotta.", voci: [["Sostituzione cerniere e regolazione ante", 60, 90]] });
  // 5) Alessandro (Roma): sta trattando con Ricci in chat, preventivo con data proposta dal cliente.
  await richiesta({ pro: lead("ricci"), cliente: clienti.get("greco"), categorie, descrizione: "Vorrei imbiancare soggiorno e corridoio, circa 45 metri quadri di pareti più il soffitto. Sul soffitto del bagno c'è un po' di muffa.", fra: 10, stato: "modifica",
    chat: [["CLIENT", "Salve, posso inviarvi qualche foto della muffa?"], ["PROFESSIONAL", "Certo, le mandi pure qui in chat. Dal preventivo ho già tenuto conto dell'antimuffa in bagno."], ["CLIENT", "Perfetto. La data che mi proponete non mi va bene, ne ho scelta un'altra dall'agenda."]],
    voci: [["Imbiancatura soggiorno e corridoio", 380, 520], ["Trattamento antimuffa bagno", 120, 180]] });
  // 6) Elena (Bari): richiesta urgente aperta a tutti i traslocatori, Lorusso ha rifiutato per date.
  await richiesta({ pro: null, cliente: clienti.get("marino"), categorie, categoria: "traslochi", descrizione: "Devo spostare un divano e un armadio dal secondo piano a un box nello stesso quartiere, entro sabato.", fra: 2, stato: "aperta", urgente: true, rifiutoDa: lead("lorusso") });

  for (const p of pro.values()) await aggiornaNumeri(p.profileId);

  console.log(`Creati ${PROFESSIONISTI.length} professionisti e ${CLIENTI.length} clienti di prova, ${RECENSIONI.length} recensioni e 6 storie in corso.`);
  await elenco();
  console.log(`\nPassword di tutti (salvala, non si rivede): ${PASSWORD}`);
}

async function categorieDb() {
  const map = new Map();
  for (const c of shared.PROFESSIONAL_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, label: c.label, subTags: [...c.subTags] },
    });
    map.set(c.slug, row);
  }
  return map;
}

function email(nome, cognome) {
  return `${slug(nome)}.${slug(cognome)}${DOMINIO_PROVA}`;
}

function slug(value) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function giorni(n, ora = 9) {
  const d = new Date(NOW.getTime() + n * DAY);
  d.setUTCHours(ora - 1, 0, 0, 0); // ora italiana (UTC+1 in inverno)
  return d;
}

function utenteBase(nome, cognome, citta, via, civico, passwordHash, giorniFa) {
  const c = CITTA[citta];
  const creato = new Date(NOW.getTime() - giorniFa * DAY);
  return {
    email: email(nome, cognome),
    passwordHash,
    name: nome,
    surname: cognome,
    street: via,
    houseNumber: civico,
    postalCode: c.cap,
    city: citta,
    province: c.prov,
    legalConsentAt: creato,
    legalConsentVersion: shared.LEGAL_CONSENT_VERSION,
    emailVerifiedAt: creato,
    testAccountAt: NOW,
    createdAt: creato,
  };
}

async function creaProfessionista(p, passwordHash, categorie) {
  const c = CITTA[p.citta];
  const categoria = categorie.get(p.categoria);
  const nuovo = p.stato === "nuovo";
  const giorniFa = nuovo ? 2 : 180;
  const user = await prisma.user.create({
    data: {
      ...utenteBase(p.nome, p.cognome, p.citta, p.via, p.civico, passwordHash, giorniFa),
      role: "PROFESSIONAL",
      signupCategorySlugs: [p.categoria, ...p.altre],
      signupEntityType: p.tipo,
      emailVerifiedAt: nuovo ? null : new Date(NOW.getTime() - giorniFa * DAY),
    },
  });
  const extra = p.altre.map((s) => ({ id: categorie.get(s).id }));
  const profile = await prisma.professionalProfile.create({
    data: {
      userId: user.id,
      categoryId: categoria.id,
      extraCategories: { connect: extra },
      categoryOrder: [p.categoria, ...p.altre],
      subTags: nuovo ? [] : [...shared.PROFESSIONAL_CATEGORIES.find((x) => x.slug === p.categoria).subTags].slice(0, 2),
      businessName: p.attivita,
      city: p.citta,
      latitude: c.lat + (Math.random() - 0.5) * 0.02,
      longitude: c.lng + (Math.random() - 0.5) * 0.02,
      address: `${p.via} ${p.civico}`,
      bio: p.bio,
      coverPreset: p.copertina,
      remoteAvailable: !!p.online,
      engagementRadiusKm: p.raggio,
      urgentEngagementRadiusKm: p.raggio,
      spokenLanguages: p.lingue,
      yearsOfExperience: p.anni,
      certifications: p.certificazioni,
      hasLiabilityInsurance: p.assicurazione,
      defaultPaymentOptions: nuovo ? [] : ["DIRECT"],
      profileDeclarationAcceptedAt: nuovo ? null : user.createdAt,
      profileDeclarationVersion: nuovo ? null : shared.PROFILE_DECLARATION_VERSION,
      verified: !nuovo,
      verifiedAt: nuovo ? null : new Date(NOW.getTime() - (giorniFa - 1) * DAY),
      pausedAt: p.stato === "pausa" ? new Date(NOW.getTime() - 6 * DAY) : null,
      pausedReason: p.pausa ?? null,
      createdAt: user.createdAt,
      services: { create: p.prestazioni.map(([name, min, max, unit]) => ({ name, priceMinEurCents: min * 100, priceMaxEurCents: max * 100, priceUnit: unit, categorySlug: p.categoria })) },
      availabilitySlots: { create: p.orari.map(([dayOfWeek, startTime, endTime]) => ({ dayOfWeek, startTime, endTime, allowsHome: true, allowsOnline: !!p.online })) },
    },
  });
  if (!nuovo) {
    await prisma.professionalFiscalProfile.create({ data: datiFiscali(p, profile.id, user.createdAt) });
    // Verifica di documento e selfie come se fosse passata da Didit di prova (sandbox).
    await prisma.identityVerification.create({
      data: {
        professionalProfileId: profile.id,
        provider: "didit",
        providerSessionId: `prova-${randomUUID()}`,
        status: "APPROVED",
        providerStatus: "Approved",
        biometricConsentAt: user.createdAt,
        biometricConsentVersion: shared.BIOMETRIC_CONSENT_VERSION,
        decidedAt: profile.verifiedAt,
        sandbox: true,
        documentExpiresAt: new Date(NOW.getTime() + 4 * 365 * DAY),
      },
    });
  }
  return { profileId: profile.id, userId: user.id, dati: p };
}

function datiFiscali(p, professionalProfileId, accettato) {
  const c = CITTA[p.citta];
  const base = {
    professionalProfileId,
    entityType: p.tipo,
    registeredStreet: p.via,
    registeredHouseNumber: p.civico,
    registeredCity: p.citta,
    registeredPostalCode: c.cap,
    registeredProvince: c.prov,
    registeredCountry: "IT",
    taxResidenceCountry: "IT",
    fiscalDeclarationAcceptedAt: accettato,
    fiscalDeclarationVersion: shared.FISCAL_DECLARATION_VERSION,
    fiscalDataCompleteAt: accettato,
  };
  if (p.tipo === "BUSINESS") {
    return { ...base, businessName: p.societa.ragione, legalForm: p.societa.forma, vatNumber: partitaIva(p.chiave), businessRegistrationNumber: p.societa.rea, chargesVat: true };
  }
  return {
    ...base,
    fiscalFirstName: p.nome,
    fiscalLastName: p.cognome,
    fiscalCodiceFiscale: codiceFiscale(p),
    dateOfBirth: new Date(`${p.nato}T00:00:00Z`),
    placeOfBirth: p.citta,
    countryOfBirth: "IT",
    ...(p.tipo === "SOLE_PROPRIETOR" ? { vatNumber: partitaIva(p.chiave), legalForm: "Ditta individuale", chargesVat: true } : { chargesVat: false }),
  };
}

async function creaCliente(c, passwordHash) {
  const user = await prisma.user.create({ data: { ...utenteBase(c.nome, c.cognome, c.citta, c.via, c.civico, passwordHash, 200), role: "CLIENT" } });
  return { userId: user.id, dati: c };
}

/** Richiesta di un cliente con indirizzo e destinatario già compilati (si vedono solo dopo l'accettazione). */
function datiRichiesta(cliente, categorie, slugCategoria, descrizione, extra = {}) {
  const c = cliente.dati;
  return {
    clientId: cliente.userId,
    categoryId: categorie.get(slugCategoria).id,
    description: descrizione,
    photoUrls: [],
    city: c.citta,
    address: c.via,
    houseNumber: c.civico,
    postalCode: CITTA[c.citta].cap,
    province: CITTA[c.citta].prov,
    recipientName: c.nome,
    recipientSurname: c.cognome,
    recipientPhone: c.tel,
    serviceMode: "HOME",
    timing: "WEEK",
    trafficSource: "DIRECT",
    ...extra,
  };
}

/** Voce di preventivo da una prestazione del listino: i prezzi a ora, metro o giorno diventano un totale. */
const QUANTITA = { JOB: [1, ""], HOUR: [4, " (4 ore)"], SQUARE_METER: [35, " (circa 35 m²)"], DAY: [1, " (1 giorno)"] };
function vocePreventivo([nome, min, max, unita], quantita) {
  const [q0, nota0] = QUANTITA[unita];
  const q = quantita ?? q0;
  const nota = quantita ? ` (${quantita} m²)` : nota0;
  return [`${nome}${nota}`, min * q, max * q];
}

function vociDa(p, voci) {
  return voci ?? [vocePreventivo(p.dati.prestazioni[0])];
}

/**
 * Un lavoro completo come lo crea il sito: richiesta -> preventivo accettato ->
 * lavoro (pagamento diretto) -> eventuale recensione.
 * giorniFa > 0 = nel passato, < 0 = nel futuro.
 */
async function lavoro({ pro, cliente, categorie, giorniFa, stato, voto, testo, risposta, descrizione, voci }) {
  const p = pro.dati;
  const items = vociDa(pro, voci);
  const totMin = items.reduce((s, [, min]) => s + min * 100, 0);
  const totMax = items.reduce((s, [, , max]) => s + max * 100, 0);
  const quando = giorni(-giorniFa, 9);
  const creata = new Date(quando.getTime() - 6 * DAY);
  const richiesta = await prisma.guidedRequest.create({
    data: { ...datiRichiesta(cliente, categorie, p.categoria, descrizione), status: "CLOSED", closedReason: "COMPLETED", professionalProfileId: pro.profileId, createdAt: creata, updatedAt: creata },
  });
  await prisma.lead.create({ data: { guidedRequestId: richiesta.id, professionalProfileId: pro.profileId, priceEurCents: 500, status: "CONVERTED", createdAt: creata } });
  const inviato = new Date(creata.getTime() + 3 * 60 * 60 * 1000);
  const quote = await prisma.quote.create({
    data: {
      guidedRequestId: richiesta.id,
      professionalProfileId: pro.profileId,
      estimatedStartDate: quando,
      arrivalTime: "09:00",
      paymentOptions: ["DIRECT"],
      cancellationNoticeHours: 24,
      status: "ACCEPTED",
      notes: "Prezzo comprensivo di uscita e materiale di consumo.",
      createdAt: inviato,
      items: { create: items.map(([name, min, max]) => ({ name, priceMinEurCents: min * 100, priceMaxEurCents: max * 100 })) },
    },
  });
  await prisma.conversationEvent.createMany({
    data: [
      { guidedRequestId: richiesta.id, professionalProfileId: pro.profileId, actor: "PROFESSIONAL", message: "Buongiorno, le ho mandato il preventivo. Se ha domande mi scriva pure qui.", createdAt: inviato },
      { guidedRequestId: richiesta.id, professionalProfileId: pro.profileId, actor: "CLIENT", message: "Grazie, va benissimo. Accetto.", createdAt: new Date(inviato.getTime() + 2 * 60 * 60 * 1000) },
    ],
  });
  const finito = stato === "finito";
  const daConfermare = stato === "da-confermare";
  const finale = finito || daConfermare ? Math.round((totMin + totMax) / 2 / 500) * 500 : null;
  const c = cliente.dati;
  const booking = await prisma.booking.create({
    data: {
      quoteId: quote.id,
      guidedRequestId: richiesta.id,
      clientId: cliente.userId,
      professionalProfileId: pro.profileId,
      scheduledAt: quando,
      scheduledEndAt: new Date(quando.getTime() + 3 * 60 * 60 * 1000),
      arrivalTime: "09:00",
      cancellationNoticeHours: 24,
      serviceMode: "HOME",
      status: finito ? "COMPLETED" : "CONFIRMED",
      acceptedTerms: shared.buildAcceptedTerms({
        start: quando, hours: 24, lateCancelKeepsDeposit: false, paymentMethod: "DIRECT",
        totals: { totalMinEurCents: totMin, totalMaxEurCents: totMax }, depositPercent: 0, onlyPaymentOption: true, now: inviato,
      }),
      recipientName: c.nome,
      recipientSurname: c.cognome,
      recipientPhone: c.tel,
      street: c.via,
      houseNumber: c.civico,
      postalCode: CITTA[c.citta].cap,
      city: c.citta,
      province: CITTA[c.citta].prov,
      finalAmountEurCents: finale,
      professionalCompletedAt: finito || daConfermare ? new Date(quando.getTime() + 3 * 60 * 60 * 1000) : null,
      professionalCompletionNote: finito || daConfermare ? "Lavoro terminato, tutto funzionante." : null,
      completionDeclarationAcceptedAt: finito || daConfermare ? new Date(quando.getTime() + 3 * 60 * 60 * 1000) : null,
      clientConfirmedCompletedAt: finito ? new Date(quando.getTime() + 8 * 60 * 60 * 1000) : null,
      createdAt: new Date(inviato.getTime() + 2 * 60 * 60 * 1000),
    },
  });
  await prisma.jobPayment.create({
    data: {
      bookingId: booking.id,
      paymentMethod: "DIRECT",
      status: finito ? "CONFIRMED" : daConfermare ? "AWAITING_CONFIRMATION" : "PENDING",
      grossAmountEurCents: finale ?? totMax,
      netAmountEurCents: finale ?? totMax,
    },
  });
  if (finito && voto) {
    const scritta = new Date(quando.getTime() + DAY);
    await prisma.review.create({
      data: {
        bookingId: booking.id,
        rating: voto,
        comment: testo,
        createdAt: scritta,
        professionalReply: risposta ?? null,
        professionalRepliedAt: risposta ? new Date(scritta.getTime() + DAY) : null,
      },
    });
  }
}

/** Richiesta ancora aperta: in attesa, con preventivo da accettare, o con data proposta dal cliente. */
async function richiesta({ pro, cliente, categorie, categoria, descrizione, fra, stato, chat = [], voci, urgente = false, rifiutoDa }) {
  const slugCat = categoria ?? pro.dati.categoria;
  const creata = new Date(NOW.getTime() - (stato === "attesa" || stato === "aperta" ? 3 : 26) * 60 * 60 * 1000);
  const r = await prisma.guidedRequest.create({
    data: {
      ...datiRichiesta(cliente, categorie, slugCat, descrizione, { isUrgent: urgente, timing: urgente ? "TODAY" : "WEEK" }),
      status: "MATCHED",
      professionalProfileId: pro?.profileId ?? null,
      chosenProfileIds: pro ? [pro.profileId] : [],
      preferredDate: giorni(fra, 0),
      preferredTimeSlot: "08:00-13:00",
      expiresAt: new Date(NOW.getTime() + 7 * DAY),
      createdAt: creata,
      updatedAt: creata,
    },
  });
  if (rifiutoDa) {
    await prisma.lead.create({ data: { guidedRequestId: r.id, professionalProfileId: rifiutoDa.profileId, priceEurCents: 900, status: "DECLINED", declineNote: "Questa settimana ho già tutti i giorni pieni, mi dispiace.", createdAt: creata } });
    return;
  }
  const leadStatus = stato === "attesa" ? "PENDING" : "CONVERTED";
  await prisma.lead.create({ data: { guidedRequestId: r.id, professionalProfileId: pro.profileId, priceEurCents: 500, status: leadStatus, createdAt: creata } });
  if (stato === "attesa") return;
  const inviato = new Date(creata.getTime() + 2 * 60 * 60 * 1000);
  const items = vociDa(pro, voci);
  await prisma.quote.create({
    data: {
      guidedRequestId: r.id,
      professionalProfileId: pro.profileId,
      estimatedStartDate: giorni(fra, 9),
      arrivalTime: "09:00",
      paymentOptions: ["DIRECT"],
      cancellationNoticeHours: 24,
      status: stato === "modifica" ? "MODIFICATION_REQUESTED" : "SENT",
      clientProposedDate: stato === "modifica" ? giorni(fra + 2, 8) : null,
      clientProposedNote: stato === "modifica" ? "Preferirei un giovedì, il martedì lavoro fuori città." : null,
      notes: "Materiale compreso. Il prezzo finale dipende da quello che trovo sul posto, resta dentro la forbice.",
      createdAt: inviato,
      items: { create: items.map(([name, min, max]) => ({ name, priceMinEurCents: min * 100, priceMaxEurCents: max * 100 })) },
    },
  });
  if (chat.length > 0) {
    await prisma.conversationEvent.createMany({
      data: chat.map(([actor, message], i) => ({ guidedRequestId: r.id, professionalProfileId: pro.profileId, actor, message, createdAt: new Date(inviato.getTime() + (i + 1) * 40 * 60 * 1000) })),
    });
  }
}

/** Numeri del profilo (ProfessionalMetrics) calcolati dai dati appena creati. */
async function aggiornaNumeri(professionalProfileId) {
  const reviews = await prisma.review.findMany({ where: { booking: { professionalProfileId } }, select: { rating: true } });
  const completed = await prisma.booking.count({ where: { professionalProfileId, status: "COMPLETED" } });
  const accepted = await prisma.booking.count({ where: { professionalProfileId } });
  const received = await prisma.lead.count({ where: { professionalProfileId } });
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  await prisma.professionalMetrics.upsert({
    where: { professionalProfileId },
    update: {},
    create: {
      professionalProfileId,
      avgRating: avg,
      reviewCount: reviews.length,
      completedJobs: completed,
      acceptedJobs: accepted,
      acceptedRequests: accepted,
      totalRequestsReceived: received,
      avgResponseTimeMinutes: received ? 45 + Math.round(Math.random() * 90) : null,
      totalResponsesMeasured: received,
      honoredAppointments: completed,
      totalAppointments: completed,
    },
  });
}

// --- Codice fiscale e partita IVA: giusti nella forma, inventati -------------
const CF_DISPARI = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };

function codiceFiscale(p) {
  const [anno, mese, giorno] = p.nato.split("-").map(Number);
  const g = String(giorno + (p.sesso === "F" ? 40 : 0)).padStart(2, "0");
  const parziale = `${shared.codiceFiscaleSurnameCode(p.cognome)}${shared.codiceFiscaleNameCode(p.nome)}${String(anno % 100).padStart(2, "0")}${"ABCDEHLMPRST"[mese - 1]}${g}${CITTA[p.citta].belfiore}`;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const ch = parziale[i];
    somma += i % 2 === 0 ? CF_DISPARI[ch] : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
  }
  const cf = parziale + String.fromCharCode(65 + (somma % 26));
  if (!shared.isValidCodiceFiscale(cf)) throw new Error(`Codice fiscale non valido per ${p.nome} ${p.cognome}`);
  return cf;
}

/** 7 cifre dal nome + ufficio 099 + cifra di controllo. Sempre la stessa per lo stesso professionista. */
function partitaIva(chiave) {
  let h = 0;
  for (const ch of chiave) h = (h * 31 + ch.charCodeAt(0)) % 10_000_000;
  const dieci = `${String(h).padStart(7, "0")}099`;
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(dieci[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    somma += d;
  }
  const piva = dieci + ((10 - (somma % 10)) % 10);
  if (!shared.isValidPartitaIva(piva)) throw new Error(`Partita IVA non valida: ${piva}`);
  return piva;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
