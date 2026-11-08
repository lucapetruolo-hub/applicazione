import type { MyProfessionalProfile, MySubscription, MyVerificationStatus } from "@professionisti/shared";
import { apiClient } from "./apiClient";

/**
 * Una sola richiesta alla volta per lo stesso dato (docs/CHANGELOG.md §345):
 * all'apertura di una pagina dell'area professionista lo chiedevano insieme
 * la pagina, il percorso "Completa il profilo" e i pallini del menu (in Oggi
 * l'abbonamento partiva tre volte, docs/changelog/2026-11-02-oggi-piu-leggera.md).
 * Chi lo chiede mentre è già in viaggio riceve la stessa risposta; appena
 * arriva, la volta dopo si chiede di nuovo, così non si legge mai un dato
 * vecchio dopo un salvataggio o un pagamento.
 */
function shareInFlight<T>(load: (token: string) => Promise<T>): (token: string) => Promise<T> {
  let inFlight: { token: string; promise: Promise<T> } | null = null;
  return (token) => {
    if (inFlight?.token === token) return inFlight.promise;
    const promise = load(token).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { token, promise };
    return promise;
  };
}

/** Ultima risposta sul profilo: se esiste o no, per quale accesso. */
let profileKnown: { token: string; exists: boolean } | null = null;

export const loadMyProfessionalProfile: (token: string) => Promise<MyProfessionalProfile | null> = shareInFlight((token) =>
  apiClient.getMyProfessionalProfile(token).then((profile) => {
    profileKnown = { token, exists: profile !== null };
    return profile;
  }),
);

/**
 * Abbonamento e verifiche esistono solo con un profilo salvato: per un
 * professionista appena iscritto ogni pagina chiedeva entrambi e riceveva due
 * "non trovato" (prova con persone simulate, punto 24,
 * docs/changelog/2026-11-08-prova-persone-simulate.md). Senza profilo la
 * richiesta non parte e chi la chiede riceve l'errore come prima.
 */
function onlyWithProfile<T>(load: (token: string) => Promise<T>): (token: string) => Promise<T> {
  return async (token) => {
    // Un "sì" già saputo basta; un "no" si ricontrolla, il profilo può essere appena stato salvato.
    const exists = (profileKnown?.token === token && profileKnown.exists) || (await loadMyProfessionalProfile(token)) !== null;
    if (!exists) throw new Error("Completa prima il tuo profilo professionista.");
    return load(token);
  };
}

/** Abbonamento del professionista, condiviso come il profilo. */
export const loadMySubscription: (token: string) => Promise<MySubscription> = shareInFlight(onlyWithProfile((token) => apiClient.getMySubscription(token)));

/** Stato delle verifiche (dati fiscali, identità), condiviso come il profilo. */
export const loadMyVerificationStatus: (token: string) => Promise<MyVerificationStatus> = shareInFlight(
  onlyWithProfile((token) => apiClient.myVerificationStatus(token)),
);
