"use client";

import { useState } from "react";
import Link from "next/link";
import {
  NOTIFICATION_DIGEST_HOURS,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TOPIC_INFO,
  notificationDigestHour,
  notificationItemChannelOn,
  notificationItemsFor,
  withNotificationItemChannel,
  type NotificationPreferences,
  type NotificationTopic,
} from "@professionisti/shared";
import { Button, Icon, Text, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { playNotificationSound } from "@/lib/notificationSound";
import { NOTIFICATION_TOPIC_STYLE } from "@/lib/notificationTopicStyle";
import { WhatsAppRemindersCard } from "@/components/WhatsAppRemindersCard";

/**
 * Impostazioni delle notifiche (docs/CHANGELOG.md §152; nuova veste in
 * docs/changelog/2026-10-28-notifiche-impostazioni.md, richiesta di Luca):
 * una scheda per argomento con i canali come pulsanti (Sito, Email) e, dove
 * l'argomento raccoglie più avvisi, un sottomenu per spegnere i singoli
 * avvisi. Ogni scelta si salva subito. "Account e sicurezza" non si spegne
 * (DSA art. 17). WhatsApp ha una scheda sua con un solo interruttore
 * (docs/changelog/2026-10-28-promemoria-whatsapp.md).
 */
const CHANNELS = [
  { key: "inApp", label: "Sito" },
  { key: "email", label: "Email" },
] as const;

export default function NotifichePage() {
  const { user, token, isLoading, notificationPrefs, setNotificationPrefs } = useAuth();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [openTopics, setOpenTopics] = useState<NotificationTopic[]>([]);

  if (isLoading) return null;
  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4" gap="$4">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          Accedi per gestire le notifiche
        </Text>
        <Link href="/accedi?redirect=/account/notifiche" style={{ textDecoration: "none" }}>
          <Button tabIndex={-1} variant="primary">Accedi</Button>
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

  function toggleChannel(topic: NotificationTopic, channel: "inApp" | "email") {
    if (!notificationPrefs) return;
    const next: NotificationPreferences = JSON.parse(JSON.stringify(notificationPrefs));
    next.topics[topic][channel] = !next.topics[topic][channel];
    void save(next);
  }

  function toggleItemChannel(key: string, channel: "inApp" | "email") {
    if (!notificationPrefs) return;
    void save(withNotificationItemChannel(notificationPrefs, key, channel, !notificationItemChannelOn(notificationPrefs, key, channel)));
  }

  const role = user.isProfessional ? "professional" : "client";
  const isAdmin = user.role === "ADMIN";

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <div className="nt-page">
        <div className="nt-header">
          <div>
            <Text fontFamily="$heading" fontWeight="800" fontSize={30} color={brand.grafite}>
              Notifiche
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              Scegli cosa ti avvisiamo e come. Ogni modifica si salva da sola.
            </Text>
          </div>
          <span className={`nt-status is-${status}`} role="status">
            {status === "saving" ? (
              "Salvataggio…"
            ) : status === "saved" ? (
              <>
                <Icon name="check" size={16} color={brand.cianografiaScuro} strokeWidth={2.5} /> Salvato
              </>
            ) : status === "error" ? (
              "Non salvato: riprova"
            ) : null}
          </span>
        </div>

        {!notificationPrefs ? (
          <Text color={brand.grafite70}>Caricamento…</Text>
        ) : (
          <>
            <section aria-labelledby="nt-site-title" className="nt-section">
              <h2 id="nt-site-title">Mentre sei sul sito</h2>
              <div className="nt-tiles">
                <SiteTile
                  icon="bell"
                  label="Popup a comparsa"
                  description="Un avviso in alto quando arriva una notifica. La campanella resta comunque."
                  checked={notificationPrefs.popups}
                  onChange={() => void save({ ...notificationPrefs, popups: !notificationPrefs.popups })}
                />
                <SiteTile
                  icon="bell-ring"
                  label="Suono"
                  description="Un suono leggero. Su iPhone non si sente in modalità silenziosa."
                  checked={notificationPrefs.sound}
                  onChange={() => void save({ ...notificationPrefs, sound: !notificationPrefs.sound })}
                  extra={
                    <button type="button" className="notif-link" onClick={() => playNotificationSound()}>
                      Prova il suono
                    </button>
                  }
                />
              </div>
            </section>

            <WhatsAppRemindersCard token={token} role={role} digestHour={notificationDigestHour(notificationPrefs)} />

            <section aria-labelledby="nt-topics-title" className="nt-section">
              <h2 id="nt-topics-title">Cosa ti avvisiamo</h2>
              <div className="nt-topics">
                {NOTIFICATION_TOPICS.map((topic) => {
                  const info = NOTIFICATION_TOPIC_INFO[topic];
                  const style = NOTIFICATION_TOPIC_STYLE[topic];
                  const copy = info[role];
                  const prefs = notificationPrefs.topics[topic];
                  const items = notificationItemsFor(topic, role, isAdmin);
                  const activeItems = items.filter(
                    (item) =>
                      item.locked ||
                      (item.channels ?? (["inApp", "email"] as const)).some((c) => prefs[c] && notificationItemChannelOn(notificationPrefs, item.key, c)),
                  ).length;
                  const topicOff = !info.locked && !prefs.inApp && !prefs.email;
                  const isOpen = openTopics.includes(topic);
                  const panelId = `nt-items-${topic}`;
                  return (
                    <article key={topic} className={`nt-topic${topicOff ? " is-off" : ""}`} style={{ ["--nt-tint" as string]: style.tint }}>
                      <div className="nt-topic-main">
                        <span className="nt-topic-icon" style={{ background: style.tint }}>
                          <Icon name={style.icon} size={22} color={style.color} strokeWidth={1.75} />
                        </span>
                        <div className="nt-topic-text">
                          <h3>{copy.label}</h3>
                          <p>
                            {topicOff
                              ? items.some((item) => item.locked)
                                ? "Spento: ti avvisiamo solo dei problemi sul lavoro, che hanno delle scadenze."
                                : "Spento: nessun avviso, le novità restano nella campanella."
                              : copy.description}
                          </p>
                        </div>
                        {info.locked ? (
                          <span className="nt-locked">
                            <Icon name="lock" size={14} color={brand.grafite70} strokeWidth={2} />
                            Sempre attivi
                          </span>
                        ) : (
                          <div className="nt-channels" role="group" aria-label={`${copy.label}: dove avvisarti`}>
                            {CHANNELS.map((channel) => {
                              const on = prefs[channel.key];
                              const upcoming = !info.activeChannels.includes(channel.key);
                              return (
                                <button
                                  key={channel.key}
                                  type="button"
                                  className={`nt-chip${on ? " is-on" : ""}`}
                                  aria-pressed={on}
                                  onClick={() => toggleChannel(topic, channel.key)}
                                >
                                  <span className="nt-chip-check" aria-hidden="true">
                                    {on ? <Icon name="check" size={14} color="#ffffff" strokeWidth={3} /> : null}
                                  </span>
                                  {channel.label}
                                  {upcoming ? <small>presto</small> : null}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {items.length > 1 ? (
                        <>
                          <button
                            type="button"
                            className="nt-more"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => setOpenTopics((prev) => (isOpen ? prev.filter((t) => t !== topic) : [...prev, topic]))}
                          >
                            <span>
                              Singoli avvisi
                              <small>
                                {activeItems === items.length ? `tutti e ${items.length} attivi` : `${activeItems} su ${items.length} attivi`}
                              </small>
                            </span>
                            <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.grafite} strokeWidth={2} />
                          </button>
                          {isOpen ? (
                            <ul id={panelId} className="nt-items">
                              {topicOff ? <li className="nt-items-note">Accendi Sito o Email qui sopra per scegliere i singoli avvisi.</li> : null}
                              {items.map((item) => (
                                <li key={item.key}>
                                  <span>
                                    <strong>{item.copy.label}</strong>
                                    {item.copy.description ? <small>{item.copy.description}</small> : null}
                                  </span>
                                  {item.locked ? (
                                    <span className="nt-locked">
                                      <Icon name="lock" size={14} color={brand.grafite70} strokeWidth={2} />
                                      Sempre attivo
                                    </span>
                                  ) : (
                                    <div className="nt-channels is-small" role="group" aria-label={`${item.copy.label}: dove avvisarti`}>
                                      {CHANNELS.filter((channel) => !item.channels || item.channels.includes(channel.key)).map((channel) => {
                                        // L'argomento spento su questo canale vale per tutti i suoi avvisi.
                                        const masterOff = !prefs[channel.key];
                                        const on = !masterOff && notificationItemChannelOn(notificationPrefs, item.key, channel.key);
                                        return (
                                          <button
                                            key={channel.key}
                                            type="button"
                                            className={`nt-chip${on ? " is-on" : ""}`}
                                            aria-pressed={on}
                                            aria-label={`${item.copy.label}: ${channel.label}`}
                                            disabled={masterOff}
                                            title={masterOff ? `${channel.label} è spento per tutto l'argomento` : undefined}
                                            onClick={() => toggleItemChannel(item.key, channel.key)}
                                          >
                                            <span className="nt-chip-check" aria-hidden="true">
                                              {on ? <Icon name="check" size={12} color="#ffffff" strokeWidth={3} /> : null}
                                            </span>
                                            {channel.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="nt-email-title" className="nt-section">
              <h2 id="nt-email-title">Quando arrivano le email</h2>
              <div className="nt-tiles">
                <SiteTile
                  icon="clock"
                  label="Riassunto della sera"
                  description={
                    role === "professional"
                      ? "Le novità senza fretta, come recensioni e pagamenti, in un'unica email. Se non c'è niente, nessuna email. Alla stessa ora arriva il riepilogo dei lavori di domani."
                      : "Le novità senza fretta, come pagamenti e documenti, in un'unica email. Se non c'è niente, nessuna email."
                  }
                  checked={notificationPrefs.digest ?? true}
                  onChange={() => void save({ ...notificationPrefs, digest: !(notificationPrefs.digest ?? true) })}
                  extra={
                    <label className="nt-hour">
                      <span>Alle</span>
                      <select
                        value={notificationDigestHour(notificationPrefs)}
                        onChange={(e) => void save({ ...notificationPrefs, digestHour: Number(e.target.value) })}
                      >
                        {NOTIFICATION_DIGEST_HOURS.map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}:00
                          </option>
                        ))}
                      </select>
                    </label>
                  }
                />
                <SiteTile
                  icon="moon"
                  label="Di notte niente email"
                  description="Dalle 22 alle 7 le email aspettano il mattino."
                  checked={notificationPrefs.quietNight ?? true}
                  onChange={() => void save({ ...notificationPrefs, quietNight: !(notificationPrefs.quietNight ?? true) })}
                  extra={
                    role === "professional" && (notificationPrefs.quietNight ?? true) ? (
                      <label className="nt-check">
                        <input
                          type="checkbox"
                          checked={notificationPrefs.quietNightUrgent ?? true}
                          onChange={() => void save({ ...notificationPrefs, quietNightUrgent: !(notificationPrefs.quietNightUrgent ?? true) })}
                        />
                        <span>
                          Anche le richieste urgenti
                          <small>Se lo togli, una richiesta urgente ti arriva subito anche di notte.</small>
                        </span>
                      </label>
                    ) : undefined
                  }
                />
              </div>
            </section>
          </>
        )}
      </div>
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

function SiteTile({
  icon,
  label,
  description,
  checked,
  onChange,
  extra,
}: {
  icon: IconName;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`nt-tile${checked ? " is-on" : ""}`}>
      <div className="nt-tile-top">
        <span className="nt-tile-icon">
          <Icon name={icon} size={20} color={checked ? brand.cianografiaScuro : brand.grafite70} strokeWidth={1.75} />
        </span>
        <Switch checked={checked} label={label} onChange={onChange} />
      </div>
      <strong>{label}</strong>
      <small>{description}</small>
      {extra}
    </div>
  );
}
