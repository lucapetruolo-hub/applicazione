"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND, biometricConsentText, type MyVerificationStatus } from "@professionisti/shared";
import { Button, Icon, Section, Surface, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { VerificationSteps } from "@/components/verification/VerificationSteps";

/** Mentre si aspetta l'esito la pagina si aggiorna da sola, per al massimo 3 minuti. */
const POLL_MS = 4000;
const POLL_LIMIT_MS = 3 * 60_000;

/**
 * Verifica identità (docs/CHANGELOG.md §246): i tre passi in alto, sotto una
 * sola azione alla volta. Documento e selfie si fanno sulla pagina di Didit
 * (dal computer Didit mostra un codice QR per continuare dal telefono); al
 * ritorno questa pagina aspetta l'esito e lo mostra.
 */
export default function VerificaIdentitaPage() {
  return (
    <Suspense fallback={null}>
      <VerificaIdentitaContent />
    </Suspense>
  );
}

function VerificaIdentitaContent() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const returned = useSearchParams().get("ritorno") === "1";
  const [status, setStatus] = useState<MyVerificationStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollStartedAt = useRef<number | null>(returned ? Date.now() : null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/accedi?redirect=/dashboard/verifica-identita");
    if (!isLoading && user && !user.isProfessional) router.replace("/dashboard");
  }, [isLoading, user, router]);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .myVerificationStatus(token)
      .then((data) => {
        setStatus(data);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Non riusciamo a leggere lo stato della verifica."));
  }, [token]);

  useEffect(load, [load]);

  // Di ritorno da Didit, o con l'esito in arrivo: si aggiorna da sola.
  const identityStatus = status?.identity.status;
  const standby = status?.identity.standby ?? false;
  const waiting = !standby && (identityStatus === "PROCESSING" || (returned && identityStatus === "STARTED"));
  useEffect(() => {
    if (!waiting) return;
    if (pollStartedAt.current === null) pollStartedAt.current = Date.now();
    if (Date.now() - pollStartedAt.current > POLL_LIMIT_MS) return;
    const timer = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, status, load]);

  async function start() {
    if (!token || (!consent && !standby)) return;
    setStarting(true);
    setStartError(null);
    try {
      const { url } = await apiClient.startIdentityVerification(token);
      if (url) {
        window.location.href = url;
        return;
      }
      // Il servizio non risponde: la richiesta resta in attesa (§249).
      setRetrying(standby);
      load();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Non siamo riusciti ad avviare la verifica. Riprova.");
    }
    setStarting(false);
  }

  if (isLoading || (!status && !loadError)) {
    return (
      <Section title="Verifica identità" maxWidth={760}>
        <Text color={brand.grafite70}>Caricamento…</Text>
      </Section>
    );
  }

  if (!status) {
    return (
      <Section title="Verifica identità" maxWidth={760}>
        <YStack gap="$3">
          <Text color={brand.urgenza}>{loadError}</Text>
          {loadError === "Completa prima il tuo profilo professionista." ? (
            <Link href="/dashboard/profilo" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Vai al tuo profilo →
            </Link>
          ) : (
            <Button variant="secondary" alignSelf="flex-start" onPress={load}>
              Riprova
            </Button>
          )}
        </YStack>
      </Section>
    );
  }

  return (
    <Section title="Verifica identità" maxWidth={760}>
      <YStack gap="$5">
        <Text color={brand.grafite70}>
          Tre passi per comparire nelle ricerche e inviare preventivi. I clienti vedono solo il badge Verificato, mai i tuoi documenti.
        </Text>
        <VerificationSteps status={status} here="verifica" />
        <ActionPanel
          status={status}
          waiting={waiting}
          stillDown={retrying}
          consent={consent}
          onConsent={setConsent}
          starting={starting}
          startError={startError}
          onStart={start}
        />
      </YStack>
    </Section>
  );
}

function Panel({ icon, tone = "neutral", title, children }: { icon: IconName; tone?: "neutral" | "ok" | "warn" | "error"; title: string; children: React.ReactNode }) {
  const accent = tone === "ok" ? brand.verificato : tone === "warn" ? brand.ottone : tone === "error" ? brand.urgenza : brand.cianografia;
  return (
    <Surface gap="$3" borderLeftWidth={4} borderLeftColor={accent} role="status">
      <XStack gap="$3" alignItems="center">
        <Icon name={icon} size={24} color={accent} strokeWidth={1.8} />
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} flex={1}>
          {title}
        </Text>
      </XStack>
      {children}
    </Surface>
  );
}

function Need({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <XStack gap="$3" alignItems="flex-start">
      <YStack width={32} height={32} borderRadius={999} backgroundColor={brand.gesso} alignItems="center" justifyContent="center" flexShrink={0}>
        <Icon name={icon} size={17} color={brand.cianografiaScuro} strokeWidth={1.8} />
      </YStack>
      <Text flex={1} fontSize={14} color={brand.grafite} paddingTop={6}>
        {children}
      </Text>
    </XStack>
  );
}

function ActionPanel({
  status,
  waiting,
  stillDown,
  consent,
  onConsent,
  starting,
  startError,
  onStart,
}: {
  status: MyVerificationStatus;
  waiting: boolean;
  stillDown: boolean;
  consent: boolean;
  onConsent: (value: boolean) => void;
  starting: boolean;
  startError: string | null;
  onStart: () => void;
}) {
  const identity = status.identity;

  if (status.verified) {
    return (
      <Panel icon="badge-check" tone="ok" title="Identità verificata">
        <Text color={brand.grafite70}>Il tuo profilo mostra il badge Verificato e puoi inviare preventivi ai clienti.</Text>
        <Link href="/dashboard/richieste" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          <Button variant="primary">Vai alle richieste</Button>
        </Link>
      </Panel>
    );
  }

  if (!identity.available) {
    return (
      <Panel icon="clock" title="La verifica dell'identità non è ancora attiva">
        <Text color={brand.grafite70}>Intanto completa i dati fiscali: quando la verifica sarà attiva ti avvisiamo noi e ti basteranno 2 minuti.</Text>
      </Panel>
    );
  }

  if (!status.fiscalDataComplete || status.taxIdState === "TO_FIX") {
    return (
      <Panel icon="file-text" title={status.fiscalDataComplete ? "Correggi prima i dati fiscali" : "Inizia dai dati fiscali"}>
        <Text color={brand.grafite70}>
          Confrontiamo il tuo documento con i dati fiscali (per un&apos;azienda con il legale rappresentante): servono completi e corretti prima di
          iniziare.
        </Text>
        <Link href="/dashboard/fiscale" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          <Button variant="primary">{status.fiscalDataComplete ? "Correggi i dati fiscali" : "Compila i dati fiscali"}</Button>
        </Link>
      </Panel>
    );
  }

  if (identity.standby) {
    return (
      <Panel icon="clock" tone="warn" title="Verifica in attesa">
        <Text color={brand.grafite70}>
          Il servizio di verifica non risponde in questo momento. Non devi fare nulla: ti avvisiamo con una notifica e un&apos;email appena puoi continuare.
        </Text>
        <YStack gap="$2">
          <Button variant="secondary" alignSelf="flex-start" disabled={starting} onPress={onStart}>
            {starting ? "Riprovo…" : "Riprova adesso"}
          </Button>
          {stillDown && !starting ? (
            <Text fontSize={13.5} color={brand.grafite70} role="status">
              Ancora non risponde: ti avvisiamo noi.
            </Text>
          ) : null}
          {startError ? (
            <Text fontSize={13.5} color={brand.urgenza} role="alert">
              {startError}
            </Text>
          ) : null}
        </YStack>
      </Panel>
    );
  }

  if (waiting) {
    return (
      <Panel icon="scan-face" title="Stiamo controllando documento e selfie">
        <XStack gap="$3" alignItems="center">
          <span className="verifica-spinner" aria-hidden />
          <Text color={brand.grafite70} flex={1}>
            Di solito bastano pochi minuti. Puoi anche chiudere la pagina: ti avvisiamo noi con una notifica e un&apos;email.
          </Text>
        </XStack>
        <style>{`.verifica-spinner{width:22px;height:22px;border-radius:50%;border:3px solid ${brand.cianografiaVelo};border-top-color:${brand.cianografia};animation:verifica-spin 0.9s linear infinite;flex-shrink:0}@keyframes verifica-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.verifica-spinner{animation:none}}`}</style>
      </Panel>
    );
  }

  const retry = identity.status === "DECLINED" || identity.status === "EXPIRED";
  const resume = identity.status === "STARTED";
  return (
    <Panel
      icon={retry ? "rotate-ccw" : "id-card"}
      tone={retry ? "error" : "neutral"}
      title={retry ? "Riprova la verifica" : resume ? "Finisci la verifica" : "Verifica la tua identità"}
    >
      {retry && identity.reason ? (
        <YStack gap="$1.5">
          <Text color={brand.urgenza}>{identity.reason}</Text>
          {/* Il professionista si corregge da solo, nessun admin in mezzo (§248). */}
          <Link href="/dashboard/fiscale" style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 14, textDecoration: "underline", alignSelf: "flex-start" }}>
            Controlla i dati fiscali →
          </Link>
        </YStack>
      ) : null}
      <Text color={brand.grafite70}>
        Serve una sola volta, prima del tuo primo preventivo: così i clienti sanno che dietro il profilo ci sei davvero tu. Ci vogliono circa 2 minuti.
      </Text>
      <YStack gap="$2.5">
        <Need icon="id-card">
          {status.isBusiness
            ? "Il documento del legale rappresentante indicato nei dati fiscali: carta d'identità, patente o passaporto, valido. La verifica la fa lui."
            : "Un tuo documento valido: carta d'identità, patente o passaporto."}
        </Need>
        <Need icon="sun">Un posto con buona luce, senza riflessi sul documento.</Need>
        <Need icon="smartphone">Meglio dal telefono. Dal computer ti mostriamo un codice QR per continuare dal telefono.</Need>
      </YStack>
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: 12,
          borderRadius: 12,
          background: brand.gesso,
          cursor: "pointer",
          border: `2px solid ${consent ? brand.cianografia : "transparent"}`,
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onConsent(event.target.checked)}
          style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: brand.cianografia, cursor: "pointer" }}
        />
        <Text fontSize={13.5} color={brand.grafite} lineHeight={19} flex={1}>
          {biometricConsentText(BRAND.name)}{" "}
          <Link href="/privacy#verifica-identita" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Informativa
          </Link>
        </Text>
      </label>
      <YStack gap="$2">
        <Button variant="primary" alignSelf="flex-start" disabled={!consent || starting || !identity.canStart} onPress={onStart}>
          {starting ? "Apertura…" : resume ? "Continua la verifica" : retry ? "Riprova la verifica" : "Inizia la verifica"}
        </Button>
        {!consent ? (
          <Text fontSize={13} color={brand.grafite70}>
            Spunta il consenso per continuare.
          </Text>
        ) : null}
        {startError ? (
          <Text fontSize={13.5} color={brand.urgenza} role="alert">
            {startError}
          </Text>
        ) : null}
        {identity.blockedReason && !startError ? (
          <Text fontSize={13.5} color={brand.grafite70}>
            {identity.blockedReason}
          </Text>
        ) : null}
      </YStack>
      <XStack gap="$2" alignItems="center">
        <Icon name="lock" size={14} color={brand.grafite70} />
        <Text fontSize={12.5} color={brand.grafite70} flex={1}>
          La verifica la fa Didit, il nostro fornitore. Foto e selfie restano a Didit: noi teniamo solo l&apos;esito.
        </Text>
      </XStack>
    </Panel>
  );
}
