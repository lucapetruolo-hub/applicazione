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

export const loadMyProfessionalProfile: (token: string) => Promise<MyProfessionalProfile | null> = shareInFlight((token) =>
  apiClient.getMyProfessionalProfile(token),
);

/** Abbonamento del professionista, condiviso come il profilo. */
export const loadMySubscription: (token: string) => Promise<MySubscription> = shareInFlight((token) => apiClient.getMySubscription(token));

/** Stato delle verifiche (dati fiscali, identità), condiviso come il profilo. */
export const loadMyVerificationStatus: (token: string) => Promise<MyVerificationStatus> = shareInFlight((token) => apiClient.myVerificationStatus(token));
