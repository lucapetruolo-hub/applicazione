"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  WHATSAPP_MESSAGES_FOR,
  type WhatsAppStatus,
} from "@professionisti/shared";
import { Button, Icon, Text, YStack, brand } from "@professionisti/ui";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { apiClient } from "@/lib/apiClient";
import { forgetWhatsAppStatus } from "@/lib/useWhatsAppStatus";

/**
 * Promemoria su WhatsApp in Notifiche (docs/changelog/2026-10-28-promemoria-whatsapp.md).
 * Un interruttore solo, non per argomento: arrivano pochi messaggi, quelli
 * elencati in `WHATSAPP_MESSAGES_FOR`. Per accenderlo si conferma il numero
 * dell'account con un codice su WhatsApp: il codice giusto vale come
 * consenso, detto prima del pulsante. Senza le chiavi di Meta la scheda dice
 * solo "in arrivo".
 */
export function WhatsAppRemindersCard({
  token,
  role,
}: {
  token: string;
  role: "client" | "professional";
}) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cambia a ogni nuovo codice: il modulo del codice riparte da capo.
  const [codeRound, setCodeRound] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient
      .whatsAppStatus(token)
      .then((next) => active && setStatus(next))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [token]);

  // Arrivati da "Ricevi il promemoria anche su WhatsApp" (#whatsapp): la
  // scheda compare dopo il caricamento, il browser da solo non ci scorre.
  const loaded = status !== null;
  useEffect(() => {
    if (loaded && window.location.hash === "#whatsapp") {
      document.getElementById("whatsapp")?.scrollIntoView({ block: "start" });
    }
  }, [loaded]);

  async function run(task: () => Promise<WhatsAppStatus>) {
    setBusy(true);
    setError(null);
    try {
      setStatus(await task());
      forgetWhatsAppStatus();
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Non è andata, riprova tra poco.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (await run(() => apiClient.sendWhatsAppCode(token)))
      setCodeRound((n) => n + 1);
  }

  const messages = WHATSAPP_MESSAGES_FOR[role];
  const details = (
    <details className="bio-tips whatsapp-more">
      <summary>Scopri di più</summary>
      <YStack gap="$1" paddingTop="$1">
        <Text fontSize={13} color={brand.grafite70}>
          Ti scriviamo solo per:
        </Text>
        <ul className="whatsapp-list">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <Text fontSize={13} color={brand.grafite70}>
          Mai pubblicità. Dalle 21 alle 8 arrivano solo gli avvisi che non
          possono aspettare. Tutto il resto resta su sito ed email. Per smettere
          basta spegnere qui o premere «Non ricevere più» sotto un messaggio.
        </Text>
      </YStack>
    </details>
  );

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <p className="notif-note">
        Non siamo riusciti a leggere lo stato di WhatsApp. Ricarica la pagina.
      </p>
    );
  } else if (!status) {
    body = <p className="notif-note">Caricamento…</p>;
  } else if (!status.available) {
    body = (
      <>
        <p className="notif-note">
          <strong>In arrivo</strong>: i promemoria degli appuntamenti anche su
          WhatsApp.
        </p>
        {details}
      </>
    );
  } else if (status.verified) {
    body = (
      <>
        <div className="notif-switch-row">
          <div>
            <strong>Promemoria su WhatsApp</strong>
            <small>
              Al numero {status.phone} ·{" "}
              <Link href="/account" className="notif-inline-link">
                Cambia numero
              </Link>
            </small>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={status.enabled}
            aria-label="Promemoria su WhatsApp"
            disabled={busy}
            className={`notif-switch${status.enabled ? " is-on" : ""}`}
            onClick={() =>
              void run(() =>
                apiClient.setWhatsAppEnabled(token, !status.enabled),
              )
            }
          >
            <span />
          </button>
        </div>
        {details}
      </>
    );
  } else if (status.codeSentTo) {
    body = (
      <>
        <EmailCodeForm
          key={codeRound}
          token={token}
          email={status.codeSentTo}
          initialResendSeconds={status.codeResendInSeconds}
          initialValidForSeconds={status.codeValidForSeconds}
          intro="Ti abbiamo mandato su WhatsApp un codice di"
          doneLabel="Promemoria su WhatsApp attivi"
          tip="Il messaggio arriva da Professionisti, con il pulsante «Copia codice»."
          submitCode={async (code) => {
            setStatus(await apiClient.confirmWhatsAppCode(token, code));
            forgetWhatsAppStatus();
          }}
          onVerified={() => undefined}
          onRequestNewCode={() => void sendCode()}
        />
        {error ? <p className="notif-error">{error}</p> : null}
      </>
    );
  } else if (!status.phone || !status.phoneIsMobile) {
    body = (
      <>
        <p className="notif-note">
          {status.phone
            ? "Il numero nel tuo account sembra un fisso: per WhatsApp serve un cellulare."
            : "Per ricevere i promemoria su WhatsApp aggiungi il tuo cellulare nell'account."}
        </p>
        <Link
          href="/account"
          style={{ textDecoration: "none", alignSelf: "flex-start" }}
        >
          <Button variant="secondary">
            {status.phone ? "Cambia numero" : "Aggiungi il cellulare"}
          </Button>
        </Link>
        {details}
      </>
    );
  } else {
    body = (
      <>
        <p className="notif-note">
          Il promemoria del giorno prima e gli avvisi sull&apos;appuntamento,
          anche su WhatsApp. Ti mandiamo un codice al{" "}
          <strong style={{ whiteSpace: "nowrap" }}>{status.phone}</strong> per
          confermare che è il tuo.
        </p>
        <Button
          variant="primary"
          alignSelf="flex-start"
          onPress={() => void sendCode()}
          disabled={busy}
          opacity={busy ? 0.6 : 1}
        >
          {busy ? "Invio..." : "Mandami il codice"}
        </Button>
        <small className="notif-small">
          Inserendo il codice accetti di ricevere questi messaggi. Li spegni
          quando vuoi.
        </small>
        {error ? <p className="notif-error">{error}</p> : null}
        {details}
      </>
    );
  }

  return (
    <section
      id="whatsapp"
      className="notif-card"
      aria-labelledby="notif-whatsapp-title"
    >
      <h2 id="notif-whatsapp-title" className="notif-card-title">
        <span
          className="notif-topic-icon"
          style={{ background: brand.cianografiaVelo }}
        >
          <Icon
            name="message-circle"
            size={16}
            color={brand.cianografiaScuro}
          />
        </span>
        WhatsApp
      </h2>
      {body}
      {status?.verified && error ? (
        <p className="notif-error">{error}</p>
      ) : null}
    </section>
  );
}
