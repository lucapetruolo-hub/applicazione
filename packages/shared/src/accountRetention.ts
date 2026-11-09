/**
 * Anni per cui resta l'impronta dell'email di un account chiuso
 * (`User.deletedEmailHash`, controllo pre-lancio 08/11/2026, E4-06): serve
 * solo a un admin che scrive l'email esatta per ritrovare "Account chiuso il
 * …" in una contestazione o su richiesta dell'autorità. 10 anni come la
 * prescrizione ordinaria (art. 2946 c.c.) e i documenti contabili collegati;
 * poi AccountClosuresService la cancella. Il numero lo conferma l'avvocato
 * (domanda 85): cambiandolo, cambia anche la Privacy, che lo legge da qui.
 */
export const DELETED_EMAIL_HASH_RETENTION_YEARS = 10;
