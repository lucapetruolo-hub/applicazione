"use client";

import { useState } from "react";
import Link from "next/link";
import {
  NOTIFICATION_TOPICS,
  NOTIFICATION_TOPIC_INFO,
  type NotificationChannelKey,
  type NotificationPreferences,
  type NotificationTopic,
} from "@professionisti/shared";
import { Button, Icon, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { playNotificationSound } from "@/lib/notificationSound";
import { NOTIFICATION_TOPIC_STYLE } from "@/lib/notificationTopicStyle";

/**
 * Impostazioni delle notifiche (docs/CHANGELOG.md §152, richiesta esplicita
 * dell'utente): per ogni argomento si sceglie il canale (sito, email, SMS),
 * più popup a comparsa e suono. Ogni scelta si salva subito. Dove un canale
 * non invia ancora niente per un argomento lo diciamo ("in arrivo"): la
 * scelta viene comunque ricordata per quando partirà. "Account e sicurezza"
 * non si spegne (DSA art. 17).
 */
const CHANNEL_LABEL: Record<NotificationChannelKey, string> = { inApp: "Sito", email: "Email", sms: "SMS" };

export default function NotifichePage() {
  const { user, token, isLoading, notificationPrefs, setNotificationPrefs } = useAuth();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (isLoading) return null;
  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4" gap="$4">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          Accedi per gestire le notifiche
        </Text>
        <Link href="/accedi?redirect=/account/notifiche" style={{ textDecoration: "none" }}>
          <Button variant="primary">Accedi</Button>
        </Link>
      </YStack>
    );
  }

  async function save(next: NotificationPreferences) {
    if (!token) return;
    const previous = notificationPrefs;
    setNotificationPrefs(next);
    setStatus("saving");
    try {
      const saved = await apiClient.updateNotificationPreferences(token, next);
      setNotificationPrefs(saved);
      setStatus("saved");
    } catch {
      if (previous) setNotificationPrefs(previous);
      setStatus("error");
    }
  }

  function toggleChannel(topic: NotificationTopic, channel: NotificationChannelKey) {
    if (!notificationPrefs) return;
    const next: NotificationPreferences = JSON.parse(JSON.stringify(notificationPrefs));
    next.topics[topic][channel] = !next.topics[topic][channel];
    void save(next);
  }

  const role = user.isProfessional ? "professional" : "client";

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={760} gap="$5">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize={30} color={brand.grafite}>
            Notifiche
          </Text>
          <Text fontSize={14} color={brand.grafite70}>
            Scegli cosa ti avvisiamo e come. Ogni modifica si salva da sola.
          </Text>
          <span className={`notif-status is-${status}`} role="status">
            {status === "saving" ? "Salvataggio…" : status === "saved" ? "Salvato" : status === "error" ? "Non salvato: riprova" : ""}
          </span>
        </YStack>

        {!notificationPrefs ? (
          <Text color={brand.grafite70}>Caricamento…</Text>
        ) : (
          <>
            <section className="notif-card" aria-labelledby="notif-site-title">
              <h2 id="notif-site-title">Mentre sei sul sito</h2>
              <SwitchRow
                label="Popup a comparsa"
                description="Un avviso in alto quando arriva una notifica nuova. La campanella e il numeretto restano comunque."
                checked={notificationPrefs.popups}
                onChange={() => void save({ ...notificationPrefs, popups: !notificationPrefs.popups })}
              />
              <SwitchRow
                label="Suono"
                description="Un suono leggero quando arriva una notifica nuova."
                checked={notificationPrefs.sound}
                onChange={() => void save({ ...notificationPrefs, sound: !notificationPrefs.sound })}
                extra={
                  <button type="button" className="notif-link" onClick={() => playNotificationSound()}>
                    Prova il suono
                  </button>
                }
              />
            </section>

            <section className="notif-card" aria-labelledby="notif-topics-title">
              <h2 id="notif-topics-title">Per argomento</h2>
              <p className="notif-note">
                <strong>Sito</strong>: campanella e popup. <strong>Email</strong>: oggi partono per nuove richieste, promemoria degli
                appuntamenti e decisioni sul tuo account; per gli altri argomenti la tua scelta è già salvata per quando le attiveremo.{" "}
                <strong>SMS</strong>: in arrivo, puoi già scegliere per cosa riceverli.
              </p>
              <div className="notif-grid" role="table" aria-label="Notifiche per argomento e canale">
                <div className="notif-grid-head" role="row">
                  <span role="columnheader">Argomento</span>
                  {(["inApp", "email", "sms"] as const).map((channel) => (
                    <span key={channel} role="columnheader">
                      {CHANNEL_LABEL[channel]}
                    </span>
                  ))}
                </div>
                {NOTIFICATION_TOPICS.map((topic) => {
                  const info = NOTIFICATION_TOPIC_INFO[topic];
                  const style = NOTIFICATION_TOPIC_STYLE[topic];
                  const copy = info[role];
                  return (
                    <div key={topic} className="notif-grid-row" role="row">
                      <div className="notif-topic" role="cell">
                        <span className="notif-topic-icon" style={{ background: style.tint }}>
                          <Icon name={style.icon} size={16} color={style.color} />
                        </span>
                        <span>
                          <strong>{copy.label}</strong>
                          <small>{copy.description}</small>
                        </span>
                      </div>
                      {(["inApp", "email", "sms"] as const).map((channel) => {
                        const locked = !!info.locked && channel !== "sms";
                        const upcoming = !info.activeChannels.includes(channel);
                        return (
                          <div key={channel} className="notif-cell" role="cell">
                            <span className="notif-cell-label">{CHANNEL_LABEL[channel]}</span>
                            <Switch
                              checked={locked ? true : notificationPrefs.topics[topic][channel]}
                              disabled={locked}
                              label={`${copy.label}: ${CHANNEL_LABEL[channel]}`}
                              onChange={() => toggleChannel(topic, channel)}
                            />
                            {locked ? <small>Sempre attivo</small> : upcoming ? <small>In arrivo</small> : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </YStack>
    </YStack>
  );
}

function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`notif-switch${checked ? " is-on" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  extra,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="notif-switch-row">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
        {extra}
      </div>
      <Switch checked={checked} label={label} onChange={onChange} />
    </div>
  );
}
