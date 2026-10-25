// Cosa vuol dire ogni badge del professionista, mostrato passando sopra il
// badge, toccandolo o raggiungendolo da tastiera (BadgeInfo). Ogni frase
// dice solo quello che il sito controlla davvero, con le parole scelte
// dall'utente (docs/CHANGELOG.md §335):
// - "Verificato": documento e selfie approvati da Didit e intestati alla
//   persona dei dati fiscali (identity-verification.service.ts,
//   `matchDocumentToFiscal`), per un'azienda il legale rappresentante.
// - "Sponsorizzato": boost a pagamento attivo, che alza il profilo nei
//   risultati (ranking boost → voto → recensioni).
// - "Nuovo profilo": iscritto da meno di 30 giorni (new-profile.util.ts).
// - "Assicurazione RC": solo dichiarata, nessun controllo.
// - "Privato" / "Partita IVA" / "Azienda": tipo scelto all'iscrizione e
//   confermato dai dati fiscali (`professionalKindOf`); per un privato i
//   diritti del consumatore non si applicano (Codice del consumo art. 49-bis).
// - "Lavoro confermato": recensione possibile solo dopo che il cliente ha
//   confermato la fine del lavoro (reviews.service.ts).
export type BadgeInfoKey = "verified" | "stripeVerified" | "boosted" | "newProfile" | "liabilityInsurance" | "confirmedJob" | "kindPrivate" | "kindVat" | "kindBusiness";

export const BADGE_INFO: Record<BadgeInfoKey, { title: string; text: string; note?: string }> = {
  verified: {
    title: "Verificato",
    text: "Ha confermato la sua identità.",
    note: "Non è una garanzia sulla qualità del lavoro.",
  },
  stripeVerified: {
    title: "Identità verificata da Stripe",
    text: "Stripe, il servizio dei pagamenti online, ha verificato l'identità del professionista.",
    note: "Non è una garanzia sulla qualità del lavoro.",
  },
  boosted: {
    title: "Sponsorizzato",
    text: "Pacchetto di visibilità a pagamento.",
  },
  newProfile: {
    title: "Nuovo profilo",
    text: "Iscritto da meno di 30 giorni.",
  },
  liabilityInsurance: {
    title: "Assicurazione RC dichiarata",
    text: "Il professionista dichiara di possedere un'assicurazione per i danni causati durante il lavoro.",
  },
  confirmedJob: {
    title: "Lavoro confermato",
    text: "Recensione di un cliente che ha prenotato il lavoro sul sito.",
  },
  kindPrivate: {
    title: "Privato",
    text: "Lavora in modo occasionale, senza partita IVA.",
    note: "I diritti del consumatore, come il recesso, non si applicano.",
  },
  kindVat: {
    title: "Partita IVA",
    text: "Lavora in proprio con partita IVA.",
  },
  kindBusiness: {
    title: "Azienda",
    text: "Impresa con partita IVA.",
  },
};
