import type { MyProfessionalProfile } from "@professionisti/shared";
import { apiClient } from "./apiClient";

// Una sola richiesta GET /professionals/me alla volta (docs/CHANGELOG.md
// §343): all'apertura di una pagina dell'area professionista la chiedevano
// insieme la pagina e i pallini del menu. Chi la chiede mentre è già in
// viaggio riceve la stessa risposta; appena arriva, la volta dopo si chiede
// di nuovo, così non si legge mai un profilo vecchio dopo un salvataggio.
let inFlight: { token: string; promise: Promise<MyProfessionalProfile | null> } | null = null;

export function loadMyProfessionalProfile(token: string): Promise<MyProfessionalProfile | null> {
  if (inFlight?.token === token) return inFlight.promise;
  const promise = apiClient.getMyProfessionalProfile(token).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { token, promise };
  return promise;
}
