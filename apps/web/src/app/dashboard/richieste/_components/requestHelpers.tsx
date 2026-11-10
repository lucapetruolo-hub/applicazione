"use client";

import { REQUEST_TIMING_LABEL, formatAppointmentTimeRange, leadAudienceLabel, type LeadAudience, formatBookingAddress, formatJobDays, type ProfessionalAvailableSlot, type ProfessionalBooking, type ProfessionalLead } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { REQUEST_STAGE_STYLE, type RequestStage } from "@/lib/requestStage";

export const smallInputStyle = { padding: 10, borderRadius: radiusDoc, border: `1px solid ${brand.bordoCampo}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite };
// Filtri in cima alla pagina (cerca/ordina/zona) — dimensioni più grandi
// della versione compatta usata nel form preventivo, richiesta esplicita
// dell'utente ("anche le dimensioni e il carattere delle scritte").
export const filterInputStyle = { padding: "14px 16px", borderRadius: radiusDoc, border: `1px solid ${brand.bordoCampo}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, backgroundColor: brand.calce };
/** Etichetta in vista sopra una tendina dei Filtri ("Mostra"). */
export const filterLabelStyle = { display: "flex", flexDirection: "column", gap: 6, fontSize: 16, fontWeight: 700, color: brand.grafite } as const;

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
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`;
}
export function formatSlotRange(startIso: string, endIso: string | null): string {
  // Lavoro su più giorni (docs/CHANGELOG.md §310).
  const days = formatJobDays(startIso, endIso);
  if (days && endIso) return `${days} · ogni giorno ${formatAppointmentTimeRange(startIso, endIso)}`;
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
 * orizzonti reali (CLAUDE.md §14) sono brevi — 35-60 minuti per le urgenti,
 * nessuna scadenza per il professionista scelto dal cliente (§209),
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
    gr.timing ? REQUEST_TIMING_LABEL[gr.timing] : null,
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

/** `label` sostituisce il nome dello stato, per esempio "Ritirata dal cliente" su una richiesta chiusa (docs/CHANGELOG.md §343). */
export function StagePill({ stage, label }: { stage: RequestStage; label?: string }) {
  const s = STAGE_STYLE[stage];
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="3" paddingVertical={8} borderRadius={999} backgroundColor={s.bg}>
      <Icon name={s.icon} size={15} strokeWidth={2} color={s.fg} />
      <Text fontFamily="body" fontSize={16} fontWeight="700" color={s.fg}>
        {label ?? s.label}
      </Text>
    </XStack>
  );
}

/**
 * Solo per te, scelto tra pochi o mandata a più professionisti
 * (docs/changelog/2026-11-10-richiesta-solo-per-te.md): stessa pillola di
 * "A domicilio", verde quando il cliente ha scelto proprio te.
 */
export function AudienceBadge({ audience }: { audience: LeadAudience }) {
  const personal = audience.kind === "direct" || audience.kind === "chosen";
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="3" paddingVertical={8} borderRadius={999} backgroundColor={personal ? brand.cianografiaVelo : brand.gesso}>
      <Icon name={audience.kind === "direct" ? "user-round" : "users"} size={15} strokeWidth={2} color={personal ? brand.verificato : brand.grafite70} />
      <Text fontFamily="body" fontSize={16} fontWeight="700" color={personal ? brand.verificato : brand.grafite}>
        {leadAudienceLabel(audience)}
      </Text>
    </XStack>
  );
}

export function ServiceBadge({ online }: { online: boolean }) {
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="3" paddingVertical={8} borderRadius={999} backgroundColor={brand.gesso}>
      <Icon name={online ? "video" : "house"} size={15} strokeWidth={2} color={brand.cianografiaScuro} />
      <Text fontFamily="body" fontSize={16} fontWeight="700" color={brand.grafite}>
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
  // Ocra scuro (5,4:1 sul fondo chiaro), prima #B8860B a 2,95:1 (E7-05 del controllo dell'8/11).
  const color = deadline.urgent ? brand.urgenza : brand.ottoneScuro;
  const bg = deadline.urgent ? "#FBEAEA" : "#FFF3D6";
  return (
    // Può andare a capo da telefono invece di uscire dalla scheda (§349).
    <XStack alignItems="center" gap={6} paddingHorizontal="3" paddingVertical={8} borderRadius={20} backgroundColor={bg} maxWidth="100%">
      <Icon name="clock" size={15} strokeWidth={2} color={color} />
      <Text fontFamily="body" fontSize={16} fontWeight="800" color={color} flexShrink={1}>
        {deadline.label}
      </Text>
    </XStack>
  );
}

/** Barra orizzontale a step (versione "mini" per questa pagina, distinta da RequestStepper: qui serve il ramo extra "Modifica richiesta"). */
export function MiniTimeline({ stage }: { stage: RequestStage }) {
  const steps: { key: string; label: string; extra?: boolean }[] = [{ key: "richiesta", label: "Richiesta" }, { key: "preventivo", label: "Preventivo inviato" }];
  if (stage === "modifica_richiesta") steps.push({ key: "modifica", label: "Modifica richiesta dal cliente", extra: true });
  steps.push({ key: "accettata", label: "Fissato" }, { key: "completata", label: "Terminato" });

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
            <Text fontFamily="body" fontSize={10} fontWeight={done ? "700" : "500"} color={done ? (step.extra ? "#8a5a00" : brand.grafite) : brand.grafite70} textAlign="center">
              {step.label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

/**
 * Lavori già fissati che si sovrappongono all'orario scelto (collaudo C-15):
 * la babysitter con due lavori alle 15:00 non riceveva nessun avviso. Le ore
 * sono "dell'orologio" in UTC, come ovunque nell'agenda. Senza ora di fine
 * si conta un'ora.
 */
export function bookingsOverlapping(
  bookings: readonly ProfessionalBooking[],
  chosen: { date: string; start: string; end?: string | null } | null,
  excludeBookingId?: string | null,
): ProfessionalBooking[] {
  if (!chosen || !/^\d{4}-\d{2}-\d{2}$/.test(chosen.date) || !/^\d{2}:\d{2}$/.test(chosen.start)) return [];
  const from = Date.parse(`${chosen.date}T${chosen.start}:00.000Z`);
  const to = chosen.end && chosen.end > chosen.start ? Date.parse(`${chosen.date}T${chosen.end}:00.000Z`) : from + 3_600_000;
  return bookings.filter((b) => {
    if (b.id === excludeBookingId || (b.status !== "CONFIRMED" && b.status !== "PENDING")) return false;
    const start = Date.parse(b.scheduledAt);
    const end = b.scheduledEndAt ? Date.parse(b.scheduledEndAt) : start + 3_600_000;
    return start < to && end > from;
  });
}

/** Una riga sotto l'orario: quali lavori ci sono già, senza bloccare l'invio. */
export function BusyTimeNotice({ bookings }: { bookings: readonly ProfessionalBooking[] }) {
  if (bookings.length === 0) return null;
  const times = bookings
    .slice(0, 3)
    .map((b) => `${formatAppointmentTimeRange(b.scheduledAt, b.scheduledEndAt ?? b.scheduledAt)}${b.clientName ? ` con ${b.clientName}` : ""}`)
    .join(", ");
  return (
    <XStack gap="2" alignItems="flex-start" role="status">
      <Icon name="clock" size={16} color={brand.grafite} />
      <Text fontSize={14} color={brand.grafite} flex={1}>
        {bookings.length === 1 ? "In quell'orario hai già un lavoro" : `In quell'orario hai già ${bookings.length} lavori`}: {times}. Puoi mandarlo lo stesso.
      </Text>
    </XStack>
  );
}
