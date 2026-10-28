"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthIconBadge } from "@/components/AuthStepHeader";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

export default function ConfermaEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfermaEmailRouter />
    </Suspense>
  );
}

/**
 * Con `?token=` è il pulsante dell'email; senza, l'attesa della conferma con
 * il codice di riserva (docs/changelog/2026-10-28-verifica-email-con-link.md).
 */
function ConfermaEmailRouter() {
  const token = useSearchParams().get("token");
  return token ? <ConfermaEmail /> : <ConfermaConCodice />;
}

function ConfermaConCodice() {
  const router = useRouter();
  const { user, token, isLoading, refreshUser } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/accedi?redirect=/conferma-email");
  }, [isLoading, user, router]);

  if (!user || !token) return null;
  const nextHref = user.isProfessional ? "/dashboard" : "/account";

  return (
    <AuthPageBackground>
      <AuthCard maxWidth={440}>
        <YStack alignItems="center" gap="$3">
          <AuthIconBadge icon="mail" />
          <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
            Conferma la tua email
          </Text>
        </YStack>
        {user.emailVerified ? (
          <YStack gap="$4" alignItems="center">
            <Text color={brand.grafite70} textAlign="center">
              L&apos;indirizzo <Text fontWeight="700">{user.email}</Text> è già confermato.
            </Text>
            <Link href={nextHref} style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Continua
            </Link>
          </YStack>
        ) : (
          <EmailCodeForm
            token={token}
            email={user.email ?? ""}
            initialResendSeconds={user.emailCodeResendInSeconds ?? 0}
            initialValidForSeconds={user.emailCodeValidForSeconds ?? 0}
            initialLinkValidForSeconds={user.emailLinkValidForSeconds ?? 0}
            linkFirst
            allowChangeEmail={user.isProfessional}
            onEmailChanged={() => void refreshUser().catch(() => {})}
            onVerified={async () => {
              await refreshUser().catch(() => {});
              router.push(nextHref);
            }}
          />
        )}
      </AuthCard>
    </AuthPageBackground>
  );
}

/**
 * Pulsante dell'email di conferma (docs/CHANGELOG.md §178,
 * docs/changelog/2026-10-28-verifica-email-con-link.md). Aprire il link non
 * conferma nulla: serve un tocco su "Conferma la mia email", così gli
 * antivirus della posta che aprono i link da soli non lo consumano. Con
 * l'accesso già fatto in questo browser (un antivirus non ce l'ha) conferma
 * da sola. Il ref evita la seconda chiamata che React fa in sviluppo.
 */
function ConfermaEmail() {
  const token = useSearchParams().get("token") ?? "";
  const { user, token: sessionToken, isLoading, refreshUser } = useAuth();
  const [state, setState] = useState<"ready" | "checking" | "done" | "error">("ready");
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "retry": nessuna risposta sul link (rete, troppi tentativi): si riprova, il link è ancora buono.
  const [errorKind, setErrorKind] = useState<"expired" | "invalid" | "retry">("invalid");
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const started = useRef(false);

  const confirm = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState("checking");
    apiClient
      .verifyEmail(token)
      .then((result) => {
        setConfirmedEmail(result.email);
        setAlreadyVerified(result.alreadyVerified);
        setState("done");
        if (!result.alreadyVerified) setPopupOpen(true);
        void refreshUser();
      })
      .catch((err) => {
        const status = (err as { status?: number }).status;
        const message = err instanceof Error ? err.message : "";
        if (status === 400) {
          setErrorKind(message.startsWith("Il link è scaduto") ? "expired" : "invalid");
          setError(message);
        } else {
          setErrorKind("retry");
          setError("Non siamo riusciti a controllare il link. Riprova tra qualche istante: è ancora buono.");
          started.current = false;
        }
        setState("error");
      });
  }, [token, refreshUser]);

  // Accesso già fatto in questo browser: conferma senza chiedere il tocco.
  useEffect(() => {
    if (!isLoading && user) confirm();
  }, [isLoading, user, confirm]);

  async function sendNewEmail() {
    if (!sessionToken) return;
    setResend("sending");
    setResendError(null);
    try {
      const result = await apiClient.resendVerificationEmail(sessionToken);
      if (result.alreadyVerified) {
        await refreshUser().catch(() => {});
        setConfirmedEmail(user?.email ?? null);
        setAlreadyVerified(true);
        setState("done");
        return;
      }
      setResend("sent");
    } catch (err) {
      setResend("idle");
      setResendError(err instanceof Error ? err.message : "Invio non riuscito, riprova tra poco.");
    }
  }

  const nextHref = user?.isProfessional ? "/dashboard" : user ? "/le-mie-richieste" : "/accedi";
  const nextLabel = user ? "Continua" : "Vai all'accesso";

  return (
    <AuthPageBackground>
      <AuthCard maxWidth={440}>
        {state === "done" ? (
          <YStack gap="$4" alignItems="center">
            <AuthIconBadge icon="check" />
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              {alreadyVerified ? "Email già confermata" : "Email confermata"}
            </Text>
            <Text fontSize={16} color={brand.grafite70} textAlign="center">
              L&apos;indirizzo <Text fontWeight="700">{confirmedEmail}</Text> è confermato.
              {user ? null : " Se ti sei iscritto da un altro dispositivo, lì la pagina si aggiorna da sola."}
            </Text>
            <Link href={nextHref} className="auth-primary-link">
              {nextLabel}
            </Link>
          </YStack>
        ) : state === "error" ? (
          <YStack gap="$4" alignItems="center">
            <AuthIconBadge icon="mail" />
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              {errorKind === "expired" ? "Il link è scaduto" : errorKind === "invalid" ? "Questo link non vale più" : "Conferma non riuscita"}
            </Text>
            <Text fontSize={16} color={brand.grafite70} textAlign="center" role="alert">
              {errorKind === "expired"
                ? "Il pulsante dell'email vale 48 ore. Chiedi una nuova email: arriva in pochi secondi."
                : errorKind === "invalid"
                  ? "Forse ti abbiamo mandato un'email più recente: apri l'ultima che hai ricevuto, oppure chiedine una nuova."
                  : error}
            </Text>
            {errorKind === "retry" ? (
              <Button variant="primary" width="100%" onPress={confirm}>
                Riprova
              </Button>
            ) : resend === "sent" ? (
              <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro} textAlign="center" role="status">
                Ti abbiamo mandato una nuova email a {user?.email}. Apri quella e premi il pulsante.
              </Text>
            ) : user && sessionToken ? (
              <Button variant="primary" width="100%" onPress={() => void sendNewEmail()} disabled={resend === "sending"} opacity={resend === "sending" ? 0.6 : 1}>
                {resend === "sending" ? "Invio..." : "Mandami una nuova email"}
              </Button>
            ) : (
              <Link href="/accedi?redirect=/conferma-email" className="auth-primary-link">
                Accedi per riceverne una nuova
              </Link>
            )}
            {resendError ? (
              <Text fontSize={16} color={brand.urgenza} textAlign="center">
                {resendError}
              </Text>
            ) : null}
          </YStack>
        ) : (
          <YStack gap="$4" alignItems="center">
            <AuthIconBadge icon="mail" />
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              Conferma la tua email
            </Text>
            <Text fontSize={16} color={brand.grafite70} textAlign="center">
              Premi il pulsante per confermare che l&apos;indirizzo è tuo.
            </Text>
            <Button variant="primary" width="100%" onPress={confirm} disabled={state === "checking" || isLoading} opacity={state === "checking" ? 0.6 : 1}>
              {state === "checking" ? "Conferma in corso..." : "Conferma la mia email"}
            </Button>
          </YStack>
        )}
      </AuthCard>
      {popupOpen && confirmedEmail ? (
        <div
          role="presentation"
          onClick={closeOnBackdrop(() => setPopupOpen(false))}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(43,32,19,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 400,
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Email verificata con successo" style={{ width: "100%", maxWidth: 380 }}>
            <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5" gap="$3" alignItems="center">
              <YStack
                width={56}
                height={56}
                borderRadius={28}
                alignItems="center"
                justifyContent="center"
                backgroundColor={brand.cianografiaPieno}
              >
                <Text color={brand.calce} fontSize="$7" fontWeight="800">
                  ✓
                </Text>
              </YStack>
              <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
                Email verificata con successo
              </Text>
              {user ? null : (
                <Text fontSize={16} color={brand.grafite70} textAlign="center">
                  Se ti sei iscritto da un altro dispositivo, lì la pagina si aggiorna da sola.
                </Text>
              )}
              <Link
                href={nextHref}
                style={{
                  color: brand.calce,
                  backgroundColor: brand.cianografiaPieno,
                  borderRadius: 999,
                  padding: "10px 24px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {nextLabel}
              </Link>
            </YStack>
          </div>
        </div>
      ) : null}
    </AuthPageBackground>
  );
}
