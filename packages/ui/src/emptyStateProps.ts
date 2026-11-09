import type { ReactNode } from "react";
import type { IconName } from "./Icon";

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * Sostituisce l'icona Lucide nel cerchio con un'illustrazione su misura
   * (richiesta esplicita dell'utente: alternativa al pattern "icona in un
   * cerchio colorato" ripetuto ovunque nel sito) — opzionale, retrocompatibile
   * con ogni chiamante esistente che passa solo `icon`. Lo stesso cerchio
   * `cianografiaVelo` resta la cornice in entrambi i casi, cambia solo cosa
   * ci sta dentro.
   */
  illustration?: ReactNode;
};
