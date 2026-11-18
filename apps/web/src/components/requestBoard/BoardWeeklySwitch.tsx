"use client";

import { useState } from "react";
import { BOARD_WEEKLY_ITEM, notificationItemChannelOn, withNotificationItemChannel } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import styles from "./BoardPage.module.css";

/**
 * "Lavori cercati della settimana" (decisione di Luca del 18/11/2026,
 * docs/changelog/2026-11-18-email-settimana-in-bacheca.md): il professionista
 * che ha fatto l'accesso spegne e riaccende qui l'email del lunedì, nella
 * pagina dove lo porta l'email. Non sta in Notifiche. Per gli altri non si vede.
 */
export function BoardWeeklySwitch() {
  const { user, token, notificationPrefs, setNotificationPrefs } = useAuth();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  if (!user?.isProfessional || !token || !notificationPrefs) return null;
  const on = notificationItemChannelOn(notificationPrefs, BOARD_WEEKLY_ITEM, "email");

  async function toggle() {
    if (!token || !notificationPrefs || state === "saving") return;
    const previous = notificationPrefs;
    const next = withNotificationItemChannel(notificationPrefs, BOARD_WEEKLY_ITEM, "email", !on);
    setNotificationPrefs(next);
    setState("saving");
    try {
      setNotificationPrefs(await apiClient.updateNotificationPreferences(token, next));
      setState("saved");
    } catch {
      setNotificationPrefs(previous);
      setState("error");
    }
  }

  return (
    <div id="email-settimana" className={styles.weekly}>
      <div className={styles.weeklyText}>
        <span id="email-settimana-titolo" className={styles.weeklyTitle}>
          Ricevi ogni lunedì le richieste nuove vicino a te
        </span>
        <span className={styles.weeklyHint} aria-live="polite">
          {state === "error"
            ? "Non siamo riusciti a salvare. Riprova."
            : on
              ? "Un'email con le richieste del tuo mestiere entro 100 km che non ti sono ancora arrivate."
              : "Spenta: non ricevi l'email del lunedì."}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="email-settimana-titolo"
        className={`${styles.switch}${on ? ` ${styles.switchOn}` : ""}`}
        onClick={() => void toggle()}
      >
        <span className={styles.switchKnob} aria-hidden="true" />
      </button>
    </div>
  );
}
