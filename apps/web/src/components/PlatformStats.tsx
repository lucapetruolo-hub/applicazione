"use client";

import { useCountUp } from "./useCountUp";
import styles from "./PlatformStats.module.css";

/**
 * "Social proof" richiesta esplicitamente dall'utente ("Utenti entrati
 * nella piattaforma / Professionisti entrati nella piattaforma") — due
 * numeri reali (`GET /stats/platform`, apps/api/src/stats), mai finti:
 * l'utente ha specificato esplicitamente che devono essere conteggi reali.
 * Non renderizzata affatto se lo stat fetch fallisce (page.tsx ricade su
 * `null`) — nessuno zero fuorviante al posto di un dato assente.
 *
 * Conteggio animato da 0 al valore reale quando la sezione entra in vista
 * (`useCountUp`, richiesta esplicita dell'utente: "rendi più innovativa la
 * homepage in generale") — il numero mostrato resta sempre quello vero,
 * solo il modo in cui vi arriva è animato.
 */
export function PlatformStats({ stats }: { stats: { totalUsers: number; totalProfessionals: number } }) {
  const { attach: attachUsers, value: usersValue } = useCountUp(stats.totalUsers);
  const { attach: attachProfessionals, value: professionalsValue } = useCountUp(stats.totalProfessionals);

  // Sotto questa soglia i numeri sarebbero più imbarazzanti che
  // rassicuranti (es. "3 utenti") — stessa logica di cautela già applicata
  // altrove nel prodotto (MIN_PROFESSIONALS_TO_SHOWCASE per la vetrina).
  if (stats.totalUsers < 10) return null;

  return (
    <div className={`is_View ${styles.wrap}`}>
      <div className={`is_View ${styles.row}`}>
        <div ref={attachUsers} className={`is_View ${styles.stat}`}>
          <span className={`is_Text font_heading ${styles.number}`}>{usersValue.toLocaleString("it-IT")}</span>
          <span className={`is_Text ${styles.label}`}>Utenti entrati nella piattaforma</span>
        </div>
        <div ref={attachProfessionals} className={`is_View ${styles.stat}`}>
          <span className={`is_Text font_heading ${styles.number}`}>{professionalsValue.toLocaleString("it-IT")}</span>
          <span className={`is_Text ${styles.label}`}>Professionisti entrati nella piattaforma</span>
        </div>
      </div>
    </div>
  );
}
