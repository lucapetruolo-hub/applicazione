"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminTwoFactorSetup } from "@professionisti/api-client";
import { Button, H1, Icon, Paragraph, Text, XStack, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { apiClient } from "@/lib/apiClient";
import { downloadTextFile, errorMessage } from "./adminUi";

/**
 * Verifica in due passaggi dell'area admin (docs/CHANGELOG.md §351). Al
 * primo ingresso si collega l'app di autenticazione (codice QR o chiave
 * scritta a mano) e si salvano i codici di recupero; poi a ogni ingresso,
 * e di nuovo dopo 8 ore, si scrive il codice dell'app. Riuscito il codice,
 * `onVerified` riceve il token nuovo che apre l'area admin.
 */
export function AdminTwoFactorGate({ token, enabled, onVerified }: { token: string; enabled: boolean; onVerified: (token: string) => Promise<void> }) {
  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={460} gap="$5">
        {enabled ? <VerifyStep token={token} onVerified={onVerified} /> : <SetupStep token={token} onVerified={onVerified} />}
      </YStack>
    </YStack>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <YStack gap="$2" alignItems="center">
      <XStack width={56} height={56} borderRadius={999} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
        <Icon name="shield-check" size={28} color={brand.cianografiaScuro} strokeWidth={2} />
      </XStack>
      <H1 size="$8" textAlign="center">
        {title}
      </H1>
      <Paragraph color={brand.grafite70} textAlign="center" fontSize={16}>
        {text}
      </Paragraph>
    </YStack>
  );
}

function SetupStep({ token, onVerified }: { token: string; onVerified: (token: string) => Promise<void> }) {
  const [setup, setSetup] = useState<AdminTwoFactorSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ token: string; recoveryCodes: string[] } | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .adminTwoFactorSetup(token)
      .then((value) => {
        if (cancelled) return;
        setSetup(value);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  if (result) return <RecoveryCodes codes={result.recoveryCodes} onDone={() => onVerified(result.token)} />;

  return (
    <>
      <Heading title="Proteggi l'area admin" text="Oltre alla password servirà un codice dall'app sul tuo telefono. Lo chiediamo ogni 8 ore." />

      <YStack gap="$3">
        <StepTitle number={1} text="Apri un'app di autenticazione e inquadra il codice QR" />
        <Text fontSize={14} color={brand.grafite70}>
          Va bene Google Authenticator, Microsoft Authenticator o Password dell&apos;iPhone.
        </Text>
        {loadError ? (
          <YStack gap="$2" alignItems="flex-start">
            <Text color={brand.urgenza}>{loadError}</Text>
            <Button variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
              Riprova
            </Button>
          </YStack>
        ) : setup ? (
          <YStack gap="$3" alignItems="center">
            <div className="admin-2fa-qr">
              {/* eslint-disable-next-line @next/next/no-img-element -- immagine SVG generata dall'API, non un file da ottimizzare */}
              <img src={setup.qrCode} alt="Codice QR da inquadrare con l'app di autenticazione" width={196} height={196} />
            </div>
            <a className="link-button" href={setup.otpauthUrl}>
              Sei sul telefono? Apri nell&apos;app
            </a>
            {showKey ? (
              <YStack gap="$2" alignItems="center">
                <Text fontSize={14} color={brand.grafite70}>
                  Nell&apos;app scegli &quot;Inserisci una chiave&quot; e scrivi:
                </Text>
                <code className="admin-2fa-key">{setup.secret}</code>
                <Text fontSize={14} color={brand.grafite70} textAlign="center">
                  Ci sono solo lettere e i numeri da 2 a 7: la O è sempre una lettera.
                </Text>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(setup.secret.replace(/\s/g, "")).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Chiave copiata" : "Copia la chiave"}
                </button>
              </YStack>
            ) : (
              <button type="button" className="link-button" onClick={() => setShowKey(true)}>
                Non riesci a inquadrarlo? Scrivi la chiave
              </button>
            )}
          </YStack>
        ) : (
          <Text color={brand.grafite70}>Preparo il codice QR...</Text>
        )}
      </YStack>

      <YStack gap="$3">
        <StepTitle number={2} text="Scrivi il codice che vedi nell'app" />
        <CodeBoxes
          disabled={!setup}
          submit={async (code) => {
            setResult(await apiClient.adminTwoFactorEnable(token, code));
          }}
        />
      </YStack>
    </>
  );
}

function StepTitle({ number, text }: { number: number; text: string }) {
  return (
    <XStack gap="$3" alignItems="center">
      <XStack width={28} height={28} borderRadius={999} backgroundColor={brand.cianografiaPieno} alignItems="center" justifyContent="center" flexShrink={0}>
        <Text color="white" fontWeight="700" fontSize={14}>
          {number}
        </Text>
      </XStack>
      <Text fontWeight="700" fontSize={16} color={brand.grafite} flexShrink={1}>
        {text}
      </Text>
    </XStack>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const text = `Codici di recupero dell'area admin\nOgni codice vale una volta sola.\n\n${codes.join("\n")}\n`;

  return (
    <>
      <Heading title="Salva i codici di recupero" text="Se perdi il telefono, ognuno di questi codici ti fa entrare una volta al posto dell'app. Non li mostreremo più." />
      <ul className="admin-2fa-codes" aria-label="Codici di recupero">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <XStack gap="$3" flexWrap="wrap" justifyContent="center">
        <Button variant="secondary" onPress={() => downloadTextFile("codici-recupero-admin.txt", text, "text/plain;charset=utf-8")}>
          Scarica
        </Button>
        <Button variant="secondary" onPress={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
          {copied ? "Copiati" : "Copia"}
        </Button>
      </XStack>
      <label className="admin-2fa-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>Li ho salvati in un posto sicuro</span>
      </label>
      <Button
        variant="primary"
        disabled={!saved || opening}
        opacity={!saved || opening ? 0.6 : 1}
        onPress={() => {
          setOpening(true);
          void onDone().finally(() => setOpening(false));
        }}
      >
        {opening ? "Apro l'area admin..." : "Continua"}
      </Button>
    </>
  );
}

function VerifyStep({ token, onVerified }: { token: string; onVerified: (token: string) => Promise<void> }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submitRecovery() {
    if (sending) return;
    if (recoveryCode.replace(/[^a-z0-9]/gi, "").length !== 8) {
      setRecoveryError("Il codice di recupero ha 8 caratteri, ad esempio ABCD-EFGH.");
      return;
    }
    setSending(true);
    setRecoveryError(null);
    try {
      await onVerified((await apiClient.adminTwoFactorVerify(token, recoveryCode)).token);
    } catch (err) {
      setRecoveryError(errorMessage(err));
      setSending(false);
    }
  }

  if (useRecovery) {
    return (
      <>
        <Heading title="Usa un codice di recupero" text="Scrivi uno dei codici che hai salvato quando hai attivato la verifica. Ognuno vale una volta sola." />
        <AuthField
          label="Codice di recupero"
          value={recoveryCode}
          onChangeText={(value) => {
            setRecoveryCode(value);
            setRecoveryError(null);
          }}
          placeholder="ABCD-EFGH"
          autoCapitalize="none"
          autoComplete="off"
          nativeID="codice-recupero-admin"
          error={recoveryError ?? undefined}
          onSubmitEditing={submitRecovery}
        />
        <Button variant="primary" onPress={submitRecovery} disabled={sending} opacity={sending ? 0.6 : 1}>
          {sending ? "Controllo..." : "Entra"}
        </Button>
        <XStack justifyContent="center">
          <button type="button" className="link-button" onClick={() => setUseRecovery(false)}>
            Usa il codice dell&apos;app
          </button>
        </XStack>
      </>
    );
  }

  return (
    <>
      <Heading title="Inserisci il codice" text="Apri l'app di autenticazione sul telefono e scrivi il codice di 6 cifre dell'area admin." />
      <CodeBoxes
        submit={async (code) => {
          await onVerified((await apiClient.adminTwoFactorVerify(token, code)).token);
        }}
      />
      <YStack gap="$2" alignItems="center">
        <Text fontSize={14} color={brand.grafite70} textAlign="center">
          Il codice vale 8 ore su questo dispositivo.
        </Text>
        <button type="button" className="link-button" onClick={() => setUseRecovery(true)}>
          Non hai il telefono? Usa un codice di recupero
        </button>
      </YStack>
    </>
  );
}

const CODE_LENGTH = 6;

/** Sei caselle con un solo campo vero sopra (stesso disegno di EmailCodeForm): parte da solo alla sesta cifra. */
function CodeBoxes({ submit, disabled = false }: { submit: (code: string) => Promise<void>; disabled?: boolean }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "error" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && (state === "idle" || state === "error")) inputRef.current?.focus();
  }, [state, disabled]);

  async function check(value: string) {
    setState("checking");
    setMessage(null);
    try {
      await submit(value);
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(errorMessage(err));
      setCode("");
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (state === "error") setState("idle");
    if (digits.length === CODE_LENGTH && state !== "checking") void check(digits);
  }

  const boxesClass = `email-code-boxes${state === "error" ? " is-error" : ""}${state === "done" ? " is-done" : ""}`;
  return (
    <YStack gap="$3">
      <div className="email-code">
        <input
          ref={inputRef}
          className="email-code-input"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH + 2}
          aria-label={`Codice di ${CODE_LENGTH} cifre dell'app`}
          aria-invalid={state === "error" ? true : undefined}
          aria-describedby="admin-2fa-status"
          disabled={disabled || state === "checking" || state === "done"}
        />
        <div className={boxesClass} aria-hidden="true">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`email-code-box${code[i] ? " is-filled" : ""}${focused && state === "idle" && i === Math.min(code.length, CODE_LENGTH - 1) ? " is-active" : ""}`}
            >
              {code[i] ?? ""}
            </span>
          ))}
        </div>
      </div>
      <div id="admin-2fa-status" role="status" aria-live="polite" style={{ minHeight: 22, textAlign: "center" }}>
        {state === "checking" ? (
          <Text fontSize={16} color={brand.grafite70}>
            Controllo il codice...
          </Text>
        ) : state === "done" ? (
          <XStack gap="$2" alignItems="center" justifyContent="center">
            <Icon name="check" size={18} color={brand.cianografiaScuro} strokeWidth={2.5} />
            <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
              Codice giusto
            </Text>
          </XStack>
        ) : message ? (
          <Text fontSize={16} color={brand.urgenza}>
            {message}
          </Text>
        ) : null}
      </div>
    </YStack>
  );
}
