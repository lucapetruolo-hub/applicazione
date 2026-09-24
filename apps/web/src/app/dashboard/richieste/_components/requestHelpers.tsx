"use client";

import { formatBookingAddress, type ProfessionalAvailableSlot, type ProfessionalBooking, type ProfessionalLead } from "@professionisti/shared";
import { Badge, Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { REQUEST_STAGE_STYLE, type RequestStage } from "@/lib/requestStage";

export const smallInputStyle = { padding: 10, borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 13, fontFamily: "inherit", color: brand.grafite };
// Filtri in cima alla pagina (cerca/ordina/zona) — dimensioni più grandi
// della versione compatta usata nel form preventivo, richiesta esplicita
// dell'utente ("anche le dimensioni e il carattere delle scritte").
export const filterInputStyle = { padding: "14px 16px", borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, backgroundColor: brand.calce };

export type QuoteItemDraft = { name: string; priceMin: string; priceMax: string };

export function slotKey(slot: ProfessionalAvailableSlot): string {
  return `${slot.date}|${slot.startTime}|${slot.endTime}`;
}
export function slotLabel(slot: ProfessionalAvailableSlot): string {
  const date = new Date(`${slot.date}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${dateLabel} · ${slot.startTime}–${slot.endTime}`;
}
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}
export function formatSlotRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const dateLabel = start.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const startLabel = start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (!endIso) return `${dateLabel} · ${startLabel}`;
  const endLabel = new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${dateLabel} · ${startLabel}–${endLabel}`;
}

/**
 * "Rispondi entro..." per una richiesta non ancora quotata — richiesta
 * esplicita dell'utente (revisione UX, finitura §10: "evidenziare quanto
 * manca alla scadenza della richiesta spinge a quotare in fretta"). Gli
 * orizzonti reali (CLAUDE.md §14) sono brevi — 20 minuti per le urgenti,
 * fino a 4 ore per le standard — mai giorni, quindi il formato resta
 * sempre minuti/ore, mai una data. `null` se la scadenza è già passata
 * (il job schedulato la marcherà EXPIRED a breve, non ha senso mostrare un
 * conto alla rovescia negativo) o non nota (Lead precedenti a questa
 * funzionalità).
 */

// Palette per gli stati — richiesta esplicita dell'utente, poi rivista una
// seconda volta con una mappatura più puntuale (turchese/completata,
// blu/da quotare, giallo/in attesa, giallo più scuro/modifiche, verde/
// accettate, rosso/scadute, rosso firebrick/annullate): eccezione
// deliberata alla palette chiusa "Vicinato" (CLAUDE.md §19) solo per questi
// indicatori di stato — stessa logica già usata altrove nel progetto per
// un'eccezione puntuale e circoscritta (es. CLAUDE.md §31, emoji
// nell'eyebrow home). Hex letterali locali a questa pagina, non toccano
// `packages/ui/tokens.ts` né le 4 varianti fisse di `Badge` (quelle restano
// semantiche "verificato/pro/urgente/nuovo" per il resto del sito).
// `annullata` e `scaduta` condividono lo stesso significato "non riuscita"
// ma sono ora distinte anche nel colore (non solo nell'icona): rosso
// standard per una scadenza, rosso firebrick — più cupo, distinguibile a
// colpo d'occhio — per un annullamento vero e proprio, richiesto
// esplicitamente due volte dall'utente nello stesso messaggio. `chiusa`
// (rifiuto/ritiro, raggruppata sotto "Scadute") non era tra gli stati
// nominati esplicitamente: resta grigio neutro, invariata.
// Definizione spostata in packages/lib/requestStage.ts (`REQUEST_STAGE_STYLE`)
// — riusata anche da /dashboard/agenda per colorare le caselle prenotazione
// con lo stesso significato, alias locale per non toccare ogni riferimento
// `STAGE_STYLE[...]` già presente in questo file.
export const STAGE_STYLE = REQUEST_STAGE_STYLE;

/**
 * Testo di ricerca concatenato per un lead — richiesta esplicita
 * dell'utente: "la ricerca falla avvenire... in qualsiasi campo", non solo
 * nome cliente/città come prima. Stesso principio già applicato alla
 * ricerca full-text dell'agenda (`buildAgendaListItems`, CLAUDE.md §49):
 * ogni campo "utile a un umano" entra nel testo cercabile, mai solo i due
 * più ovvi. Include anche i dati rivelati dopo l'accettazione (indirizzo/
 * contatti sulla `booking`, quando esiste) — un professionista deve poter
 * ritrovare una richiesta già accettata cercando l'indirizzo del cliente.
 */
export function leadSearchText(lead: ProfessionalLead, stage: RequestStage | undefined, booking: ProfessionalBooking | undefined): string {
  const gr = lead.guidedRequest;
  const recipientName = booking ? [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") : "";
  return [
    gr.clientName,
    gr.categoryLabel,
    gr.description,
    gr.city,
    gr.serviceMode === "ONLINE" ? "consulenza online" : "a domicilio",
    gr.isUrgent ? "urgente" : null,
    stage ? STAGE_STYLE[stage].label : null,
    lead.declineNote,
    lead.professionalNote,
    lead.quote?.notes,
    ...(lead.quote?.items.map((i) => i.name) ?? []),
    recipientName,
    booking?.clientPhone,
    booking?.clientEmail,
    booking ? formatBookingAddress(booking) : null,
    booking?.description,
    booking?.cancellationNote,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function StagePill({ stage }: { stage: RequestStage }) {
  const s = STAGE_STYLE[stage];
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={s.bg}>
      <Icon name={s.icon} size={15} strokeWidth={2} color={s.fg} />
      <Text fontFamily="$body" fontSize={14} fontWeight="800" color={s.fg} textTransform="uppercase">
        {s.label}
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
 * "Rispondi entro..." per una richiesta da quotare — richiesta esplicita
 * dell'utente (revisione UX, finitura #10): rende visibile a colpo
 * d'occhio quanto tempo resta prima che il Lead scada, per spingere a
 * quotare in fretta. Ambra di default, rosso (`brand.urgenza`) sotto i 30
 * minuti — stesso principio "rosso solo su urgenza" già seguito ovunque
 * nel prodotto.
 */
export function DeadlinePill({ deadline }: { deadline: { label: string; urgent: boolean } }) {
  const color = deadline.urgent ? brand.urgenza : "#B8860B";
  const bg = deadline.urgent ? "#FBEAEA" : "#FFF3D6";
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={bg}>
      <Icon name="clock" size={15} strokeWidth={2} color={color} />
      <Text fontFamily="$body" fontSize={14} fontWeight="800" color={color}>
        {deadline.label}
      </Text>
    </XStack>
  );
}

/** Barra orizzontale a step (versione "mini" per questa pagina, distinta da RequestStepper: qui serve il ramo extra "Modifica richiesta"). */
export function MiniTimeline({ stage }: { stage: RequestStage }) {
  const steps: { key: string; label: string; extra?: boolean }[] = [{ key: "richiesta", label: "Richiesta" }, { key: "preventivo", label: "Preventivo inviato" }];
  if (stage === "modifica_richiesta") steps.push({ key: "modifica", label: "Modifica richiesta dal cliente", extra: true });
  steps.push({ key: "accettata", label: "Accettata" }, { key: "completata", label: "Completata" });

  const reachedIndex: Record<RequestStage, number> = {
    da_quotare: 0,
    in_attesa: 1,
    modifica_richiesta: 2,
    accettata: stage === "modifica_richiesta" ? 3 : 2,
    completata: stage === "modifica_richiesta" ? 4 : 3,
    // Una prenotazione annullata era comunque già "accettata" prima di
    // esserlo (stesso passo raggiunto, non un passo a sé nella mini
    // timeline che non ha una bolla dedicata per questo stato).
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
