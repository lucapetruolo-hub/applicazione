"use client";

import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { CLIENT_STAGE_LABEL, REQUEST_STAGE_STYLE, type RequestStage } from "@/lib/requestStage";

// Foto E video (richiesta esplicita dell'utente), fino a 5 elementi
// (aumentato da 3, stessa richiesta).
export const MAX_REQUEST_PHOTOS = 5;

export const textareaStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};
// Filtri in cima alla pagina (cerca/ordina/zona) — stesse dimensioni già in
// uso in /dashboard/richieste per lo stesso identico blocco.
export const filterInputStyle = { padding: "14px 16px", borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, backgroundColor: brand.calce };

export const STAGE_STYLE = REQUEST_STAGE_STYLE;

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Testo di ricerca concatenato per una richiesta — stesso principio già
 * applicato lato professionista (`leadSearchText`, /dashboard/richieste):
 * ogni campo utile a un umano entra nel testo cercabile, non solo
 * categoria/città.
 */
export function clientRequestSearchText(request: ClientGuidedRequest, stage: RequestStage | undefined, booking: ClientBooking | undefined): string {
  return [
    request.categoryLabel,
    request.description,
    request.city,
    request.address,
    request.serviceMode === "ONLINE" ? "consulenza online" : "a domicilio",
    request.isUrgent ? "urgente" : null,
    stage ? CLIENT_STAGE_LABEL[stage] : null,
    request.recipientName,
    request.recipientSurname,
    ...request.sentTo.map((p) => p.businessName),
    ...request.quotes.map((q) => q.businessName),
    ...request.quotes.map((q) => q.notes),
    ...request.quotes.flatMap((q) => q.items.map((i) => i.name)),
    booking?.businessName,
    booking?.description,
    booking?.cancellationNote,
    booking?.meetingLink,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Stessa pillola colorata di /dashboard/richieste, testo lato cliente (`CLIENT_STAGE_LABEL`). */
export function ClientStagePill({ stage }: { stage: RequestStage }) {
  const s = STAGE_STYLE[stage];
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={s.bg}>
      <Icon name={s.icon} size={15} strokeWidth={2} color={s.fg} />
      <Text fontFamily="$body" fontSize={14} fontWeight="800" color={s.fg} textTransform="uppercase">
        {CLIENT_STAGE_LABEL[stage]}
      </Text>
    </XStack>
  );
}

export function ServiceBadge({ online }: { online: boolean }) {
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={brand.gesso}>
      <Icon name={online ? "video" : "house"} size={15} strokeWidth={2} color={brand.cianografia} />
      <Text fontFamily="$body" fontSize={14} fontWeight="700" color={brand.grafite}>
        {online ? "Consulenza online" : "A domicilio"}
      </Text>
    </XStack>
  );
}

/**
 * Barra a step (stesso pattern di `MiniTimeline` in /dashboard/richieste),
 * riscritta qui con le etichette lato cliente: lo stadio "modifica_richiesta"
 * significa sempre "hai proposto tu un'altra data" (solo il cliente può
 * portare un preventivo in quello stato, `QuotesService.proposeDate`), mai
 * "il cliente ha richiesto una modifica" come nella versione professionista.
 */
export function ClientMiniTimeline({ stage }: { stage: RequestStage }) {
  const steps: { key: string; label: string; extra?: boolean }[] = [
    { key: "richiesta", label: "Richiesta inviata" },
    { key: "preventivo", label: "Preventivo ricevuto" },
  ];
  if (stage === "modifica_richiesta") steps.push({ key: "modifica", label: "Hai proposto un'altra data", extra: true });
  steps.push({ key: "accettata", label: "Accettata" }, { key: "completata", label: "Completata" });

  const reachedIndex: Record<RequestStage, number> = {
    da_quotare: 0,
    in_attesa: 1,
    modifica_richiesta: 2,
    accettata: stage === "modifica_richiesta" ? 3 : 2,
    completata: stage === "modifica_richiesta" ? 4 : 3,
    annullata: 2,
    scaduta: -1,
    chiusa: -1,
  };
  const reached = reachedIndex[stage];

  return (
    <XStack alignItems="flex-start" width="100%">
      {steps.map((step, i) => {
        const done = reached >= i;
        return (
          <YStack key={step.key} flex={1} alignItems="center" position="relative" minWidth={0}>
            {i > 0 ? (
              <YStack position="absolute" top={5} right="50%" width="100%" height={2} backgroundColor={done ? brand.cianografia : brand.filetto} zIndex={0} />
            ) : null}
            <YStack
              width={step.extra ? 13 : 11}
              height={step.extra ? 13 : 11}
              borderRadius={999}
              backgroundColor={done ? (step.extra ? brand.ottone : brand.cianografia) : brand.filetto}
              zIndex={1}
              marginBottom={5}
            />
            <Text fontFamily="$body" fontSize={10} fontWeight={done ? "700" : "500"} color={done ? (step.extra ? "#8a5a00" : brand.grafite) : brand.grafite70} textAlign="center">
              {step.label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}
