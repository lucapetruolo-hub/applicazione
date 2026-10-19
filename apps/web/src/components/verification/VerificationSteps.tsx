"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { taxIdCheckMessage, taxIdStepTitle, type MyVerificationStatus } from "@professionisti/shared";
import { Icon, Surface, Text, XStack, YStack, brand, radiusDoc, type IconName } from "@professionisti/ui";

type StepTone = "done" | "current" | "waiting" | "error" | "upcoming";

const TONE: Record<StepTone, { color: string; background: string; label: string }> = {
  done: { color: brand.verificato, background: brand.cianografiaVelo, label: "Fatto" },
  current: { color: brand.cianografiaScuro, background: brand.cianografiaVelo, label: "Da fare" },
  waiting: { color: "#8A6416", background: brand.ottoneVelo, label: "In corso" },
  error: { color: brand.urgenza, background: brand.urgenzaVelo, label: "Da correggere" },
  upcoming: { color: brand.grafite70, background: brand.gesso, label: "Dopo" },
};

type Step = { icon: IconName; title: string; tone: StepTone; text: string; extra?: ReactNode; action?: { href: string; label: string } };

/** I tre passi in parole semplici (titoli senza nomi di enti, §254), con lo stato di ciascuno (docs/CHANGELOG.md §253). */
export function verificationSteps(status: MyVerificationStatus, here: "fiscale" | "verifica"): Step[] {
  const fiscalHref = "/dashboard/fiscale";
  const step1: Step = status.fiscalDataComplete
    ? { icon: "file-text", title: "Dati fiscali", tone: "done", text: "Compilati." }
    : {
        icon: "file-text",
        title: "Dati fiscali",
        tone: "current",
        text: `Manca: ${status.fiscalMissing.join(", ")}.`,
        action: here === "fiscale" ? undefined : { href: fiscalHref, label: "Compila i dati fiscali" },
      };

  const taxTitle = taxIdStepTitle(status.taxIdChecks.map((check) => check.kind));
  const problems = status.taxIdChecks.filter((check) => check.status === "INVALID" || check.status === "PENDING");
  const step2: Step = !status.fiscalDataComplete
    ? { icon: "landmark", title: taxTitle, tone: "upcoming", text: "Parte da sola quando salvi i dati fiscali." }
    : status.taxIdState === "TO_FIX"
      ? {
          icon: "landmark",
          title: taxTitle,
          tone: "error",
          text: problems.filter((c) => c.status === "INVALID").map(taxIdCheckMessage).join(" "),
          action: here === "fiscale" ? undefined : { href: fiscalHref, label: "Correggi i dati fiscali" },
        }
      : status.taxIdState === "CHECKING"
        ? { icon: "landmark", title: taxTitle, tone: "waiting", text: problems.map(taxIdCheckMessage).join(" ") }
        : status.taxIdState === "NOT_NEEDED"
          ? { icon: "landmark", title: taxTitle, tone: "done", text: "Non serve per i tuoi dati." }
          : { icon: "landmark", title: taxTitle, tone: "done", text: "Dati confermati." };

  const identity = status.identity;
  const verifyAction = here === "verifica" ? undefined : { href: "/dashboard/verifica-identita", label: "Verifica la tua identità" };
  let step3: Step;
  if (status.verified) step3 = { icon: "id-card", title: "Documento e selfie", tone: "done", text: "Identità verificata: hai il badge Verificato." };
  else if (!identity.available) step3 = { icon: "id-card", title: "Documento e selfie", tone: "upcoming", text: "Non ancora attiva: ti avvisiamo noi quando puoi farla." };
  else if (identity.standby)
    step3 = { icon: "id-card", title: "Documento e selfie", tone: "waiting", text: here === "verifica" ? "In attesa del servizio di verifica." : "In attesa: ti avvisiamo con una notifica e un'email appena puoi continuare." };
  else if (identity.status === "PROCESSING") step3 = { icon: "id-card", title: "Documento e selfie", tone: "waiting", text: "Stiamo aspettando l'esito: di solito bastano pochi minuti." };
  else if (identity.status === "DECLINED" || identity.status === "EXPIRED")
    step3 = { icon: "id-card", title: "Documento e selfie", tone: "error", text: here === "verifica" ? "Da rifare: qui sotto trovi cosa correggere." : (identity.reason ?? "Non è andata a buon fine: puoi riprovare."), action: verifyAction };
  else if (!status.fiscalDataComplete || status.taxIdState === "TO_FIX")
    step3 = { icon: "id-card", title: "Documento e selfie", tone: "upcoming", text: "Serve prima di inviare il tuo primo preventivo. Circa 2 minuti." };
  else
    step3 = {
      icon: "id-card",
      title: "Documento e selfie",
      tone: "current",
      text: identity.status === "STARTED" ? "L'hai iniziata ma non finita." : "Serve prima di inviare il tuo primo preventivo. Circa 2 minuti.",
      action: verifyAction,
    };

  return [step1, step2, step3];
}

function Outcome({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <XStack alignItems="center" gap="$1.5" paddingHorizontal="$2.5" paddingVertical="$1.5" borderRadius={999} backgroundColor={ok ? brand.cianografiaVelo : brand.gesso}>
      <Icon name={ok ? "check" : "lock"} size={14} strokeWidth={2.2} color={ok ? brand.verificato : brand.grafite70} />
      <Text fontSize={13} fontWeight="600" color={ok ? brand.verificato : brand.grafite70}>
        {children}
      </Text>
    </XStack>
  );
}

/**
 * Riquadro "Verifica in 3 passi": dati fiscali, verifica di codice fiscale e
 * P.IVA, documento e selfie. Usato in Verifica identità e in cima a Dati
 * fiscali, così il professionista vede sempre a che punto è e cosa sblocca.
 */
export function VerificationSteps({ status, here }: { status: MyVerificationStatus; here: "fiscale" | "verifica" }) {
  const steps = verificationSteps(status, here);
  return (
    <Surface gap="$4" aria-label="Verifica in tre passi">
      <YStack gap="$2">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Verifica in 3 passi
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          <Outcome ok={status.publicVisible}>{status.publicVisible ? "Compari nelle ricerche" : "Non compari nelle ricerche"}</Outcome>
          <Outcome ok={status.canSendQuotes}>{status.canSendQuotes ? "Puoi inviare preventivi" : "Preventivi bloccati"}</Outcome>
        </XStack>
      </YStack>
      <YStack tag="ol" margin={0} padding={0} gap="$3">
        {steps.map((step, index) => {
          const tone = TONE[step.tone];
          return (
            <XStack tag="li" key={step.title} gap="$3" alignItems="flex-start" style={{ listStyle: "none" }}>
              <YStack
                width={36}
                height={36}
                borderRadius={999}
                alignItems="center"
                justifyContent="center"
                backgroundColor={tone.background}
                flexShrink={0}
                aria-hidden
              >
                {step.tone === "done" ? (
                  <Icon name="check" size={18} strokeWidth={2.4} color={tone.color} />
                ) : step.tone === "error" ? (
                  <Icon name="triangle-alert" size={17} strokeWidth={2} color={tone.color} />
                ) : (
                  <Text fontWeight="800" color={tone.color}>
                    {index + 1}
                  </Text>
                )}
              </YStack>
              <YStack flex={1} minWidth={0} gap="$1" paddingTop={2}>
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  <Text fontWeight="700" color={brand.grafite}>
                    {step.title}
                  </Text>
                  <Text fontSize={12} fontWeight="700" color={tone.color} paddingHorizontal="$2" paddingVertical={2} borderRadius={radiusDoc} backgroundColor={tone.background}>
                    {tone.label}
                  </Text>
                </XStack>
                <Text fontSize={14} color={brand.grafite70}>
                  {step.text}
                </Text>
                {step.action ? (
                  <Link href={step.action.href} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 14, textDecoration: "underline", alignSelf: "flex-start" }}>
                    {step.action.label} →
                  </Link>
                ) : null}
              </YStack>
            </XStack>
          );
        })}
      </YStack>
    </Surface>
  );
}
