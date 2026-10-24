// Cosa vuol dire ogni badge del professionista, mostrato passando sopra il
// badge, toccandolo o raggiungendolo da tastiera (BadgeInfo). Ogni frase
// dice solo quello che il sito controlla davvero (docs/CHANGELOG.md §326):
// - "Verificato": documento e selfie approvati da Didit e intestati alla
//   persona dei dati fiscali (identity-verification.service.ts,
//   `matchDocumentToFiscal`), per un'azienda il legale rappresentante.
// - "Sponsorizzato": boost a pagamento attivo, che alza il profilo nei
//   risultati (ranking boost → voto → recensioni).
// - "Nuovo profilo": iscritto da meno di 30 giorni (new-profile.util.ts).
// - "Assicurazione RC": solo dichiarata, nessun controllo.
// - "Lavoro confermato": recensione possibile solo dopo che il cliente ha
//   confermato la fine del lavoro (reviews.service.ts).
export type BadgeInfoKey = "verified" | "stripeVerified" | "boosted" | "newProfile" | "liabilityInsurance" | "confirmedJob";

export const BADGE_INFO: Record<BadgeInfoKey, { title: string; text: string; note?: string }> = {
  verified: {
    title: "Verificato",
    text: "Ha confermato la sua identità con un documento e un selfie, e i dati coincidono con quelli fiscali del profilo.",
    note: "Non è una garanzia sulla qualità del lavoro.",
  },
  stripeVerified: {
    title: "Identità verificata da Stripe",
    text: "Stripe, il servizio dei pagamenti online, ha verificato l'identità del professionista.",
    note: "Non è una garanzia sulla qualità del lavoro.",
  },
  boosted: {
    title: "Sponsorizzato",
    text: "Compare più in alto perché ha un pacchetto di visibilità a pagamento. Le recensioni non cambiano.",
  },
  newProfile: {
    title: "Nuovo profilo",
    text: "Iscritto da meno di 30 giorni: per questo può avere ancora poche recensioni.",
  },
  liabilityInsurance: {
    title: "Assicurazione RC dichiarata",
    text: "Il professionista dice di avere un'assicurazione per i danni causati durante il lavoro. Non l'abbiamo controllata.",
  },
  confirmedJob: {
    title: "Lavoro confermato",
    text: "Recensione di un cliente che ha prenotato il lavoro sul sito e ha confermato che è finito.",
  },
};
