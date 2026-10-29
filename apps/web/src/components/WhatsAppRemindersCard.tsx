"use client";

import { useEffect, useState } from "react";
import {
  WHATSAPP_MESSAGES_FOR,
  isPlausiblePhoneNumber,
  type WhatsAppStatus,
} from "@professionisti/shared";
import { Button, Icon, Text, YStack, brand } from "@professionisti/ui";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { forgetWhatsAppStatus } from "@/lib/useWhatsAppStatus";

/**
 * Promemoria su WhatsApp in Notifiche (docs/changelog/2026-10-28-promemoria-whatsapp.md).
 * Un interruttore solo, non per argomento: arrivano pochi messaggi, quelli
 * elencati in `WHATSAPP_MESSAGES_FOR`. Per accenderlo si conferma il numero
 * dell'account con un codice su WhatsApp: il codice giusto vale come
 * consenso, detto prima del pulsante. Senza le chiavi di Meta la scheda dice
 * solo "in arrivo". Il numero si corregge qui con "Modifica", senza passare
 * da Account: è lo stesso numero dell'account (uno per persona, unico).
 */
const phoneInputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  width: "100%",
};

export function WhatsAppRemindersCard({
  token,
  role,
  digestHour,
}: {
  token: string;
  role: "client" | "professional";
  /** Ora del riassunto della sera, la stessa del riepilogo dei lavori su WhatsApp. */
  digestHour: number;
}) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cambia a ogni nuovo codice: il modulo del codice riparte da capo.
  const [codeRound, setCodeRound] = useState(0);
  const { refreshUser } = useAuth();
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

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

  function startEditingPhone() {
    setNewPhone(status?.phone ?? "");
    setPhoneError(null);
    setError(null);
    setEditingPhone(true);
  }

  /** Salva il numero nell'account e manda subito il codice al nuovo. */
  async function savePhoneAndSendCode() {
    const next = newPhone.trim();
    if (!isPlausiblePhoneNumber(next)) {
      setPhoneError(
        "Scrivi un numero di cellulare valido, ad esempio 333 1234567.",
      );
      return;
    }
    if (next === status?.phone && status.verified) {
      setEditingPhone(false);
      return;
    }
    setBusy(true);
    setPhoneError(null);
    try {
      if (next !== status?.phone) {
        await apiClient.updateAccount(token, { phone: next });
        void refreshUser();
      }
    } catch (err) {
      setPhoneError(
        err instanceof Error
          ? err.message
          : "Non siamo riusciti a cambiare il numero, riprova.",
      );
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditingPhone(false);
    // Il numero è cambiato anche se il codice non parte (es. un fisso):
    // la scheda lo mostra comunque aggiornato.
    if (!(await run(() => apiClient.sendWhatsAppCode(token)))) {
      setStatus(await apiClient.whatsAppStatus(token).catch(() => status));
      forgetWhatsAppStatus();
      return;
    }
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
  } else if (status.available && editingPhone) {
    body = (
      <>
        <p className="notif-note">
          <strong>Il cellulare su cui ricevere il codice</strong>
        </p>
        <PhoneNumberInput
          value={newPhone}
          onChange={(value) => {
            setNewPhone(value);
            setPhoneError(null);
          }}
          style={phoneInputStyle}
          placeholder="Es. 333 1234567"
        />
        <small className="notif-small">
          Diventa anche il numero del tuo account, quello che si vede dopo un
          appuntamento confermato.
        </small>
        {phoneError ? <p className="notif-error">{phoneError}</p> : null}
        <Button
          variant="primary"
          alignSelf="flex-start"
          onPress={() => void savePhoneAndSendCode()}
          disabled={busy}
          opacity={busy ? 0.6 : 1}
        >
          {busy ? "Invio..." : "Manda il codice a questo numero"}
        </Button>
        <Button
          variant="ghost"
          alignSelf="flex-start"
          onPress={() => setEditingPhone(false)}
        >
          Annulla
        </Button>
      </>
    );
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
              Al numero{" "}
              <span style={{ whiteSpace: "nowrap" }}>{status.phone}</span> ·{" "}
              <button
                type="button"
                className="notif-inline-link"
                onClick={startEditingPhone}
              >
                Modifica
              </button>
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
        {/* Una sola ora della sera per sito, email e WhatsApp (Luca, 29/10/2026). */}
        {status.enabled && role === "professional" ? (
          <p className="notif-small">
            Il riepilogo dei lavori del giorno dopo arriva alle {digestHour}:00,
            l&apos;ora del riassunto della sera: la cambi in «Quando arrivano le
            email».
          </p>
        ) : null}
        {details}
      </>
    );
  } else if (status.codeSentTo) {
    body = (
      <>
        <EmailCodeForm
          key={codeRound}
          token={token}
          email={status.phone ?? status.codeSentTo}
          initialResendSeconds={status.codeResendInSeconds}
          initialValidForSeconds={status.codeValidForSeconds}
          intro="Abbiamo mandato su WhatsApp il codice di conferma di"
          doneLabel="Promemoria su WhatsApp attivi"
          tip="Il messaggio arriva da Professionisti, con il pulsante «Copia codice»."
          submitCode={async (code) => {
            setStatus(await apiClient.confirmWhatsAppCode(token, code));
            forgetWhatsAppStatus();
          }}
          onVerified={() => undefined}
          onRequestNewCode={() => void sendCode()}
        />
        <p className="notif-note" style={{ textAlign: "center" }}>
          Non è il tuo numero?{" "}
          <button
            type="button"
            className="notif-inline-link"
            onClick={startEditingPhone}
          >
            Modifica
          </button>
        </p>
        {error ? <p className="notif-error">{error}</p> : null}
      </>
    );
  } else if (!status.phone || !status.phoneIsMobile) {
    body = (
      <>
        <p className="notif-note">
          {status.phone
            ? "Il numero nel tuo account sembra un fisso: per WhatsApp serve un cellulare."
            : "Per ricevere i promemoria su WhatsApp aggiungi il tuo cellulare."}
        </p>
        <Button
          variant="secondary"
          alignSelf="flex-start"
          onPress={startEditingPhone}
        >
          {status.phone ? "Cambia numero" : "Aggiungi il cellulare"}
        </Button>
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
          confermare che è il tuo.{" "}
          <button
            type="button"
            className="notif-inline-link"
            onClick={startEditingPhone}
          >
            Modifica
          </button>
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
