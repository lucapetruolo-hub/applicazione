"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatServicePriceRange, type ProfessionalAgenda, type ProfessionalDetail } from "@professionisti/shared";
import { Badge, Button, Chip, EmptyState, Icon, Rating, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

// Colonne fisse Oggi + 3 giorni (stessa griglia della mini-agenda di ricerca,
// vedi ProfessionalCard in packages/ui) — qui costruita a partire dai 14
// giorni già disponibili in agenda.days, senza bisogno di una ricerca
// aggiuntiva se non c'è disponibilità nella finestra: il "prossimo orario
// libero" è cercato nello stesso payload già scaricato.
const AGENDA_PREVIEW_DAYS = 4;
const WEEKDAY_SHORT_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_SHORT_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function agendaDayLabel(offset: number, dayOfWeek: number): string {
  if (offset === 0) return "Oggi";
  if (offset === 1) return "Domani";
  return WEEKDAY_SHORT_LABELS[dayOfWeek]!;
}

function agendaDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTH_SHORT_LABELS[date.getUTCMonth()]}`;
}

export function ProfessionalDetailContent({ professional }: { professional: ProfessionalDetail }) {
  const { user, token } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  // Ogni fascia (esatta o generica) apre sempre la richiesta di preventivo
  // precompilata — richiesta esplicita dell'utente: nessuna prenotazione
  // istantanea da qui, a prescindere dalla capienza impostata dal
  // professionista. `windowDays` sono le prime AGENDA_PREVIEW_DAYS colonne;
  // `nextAvailableSlot` è cercato nel resto dei 14 giorni già scaricati solo
  // se la finestra visibile non ha nulla di libero.
  const agendaPreview = useMemo(() => {
    if (!agenda) return null;
    const windowDays = agenda.days.slice(0, AGENDA_PREVIEW_DAYS).map((day, offset) => ({
      date: day.date,
      label: agendaDayLabel(offset, day.dayOfWeek),
      dateLabel: agendaDateLabel(day.date),
      slots: day.slots,
    }));
    const hasAvailableInWindow = windowDays.some((day) => day.slots.some((slot) => slot.bookedCount < slot.maxBookings));
    const timeRows = hasAvailableInWindow
      ? Array.from(new Set(windowDays.flatMap((day) => day.slots.map((slot) => slot.startTime)))).sort()
      : [];
    let nextAvailableSlot: { date: string; dateLabel: string; startTime: string; endTime: string } | null = null;
    if (!hasAvailableInWindow) {
      outer: for (const day of agenda.days) {
        for (const slot of [...day.slots].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
          if (slot.bookedCount < slot.maxBookings) {
            nextAvailableSlot = { date: day.date, dateLabel: agendaDateLabel(day.date), startTime: slot.startTime, endTime: slot.endTime };
            break outer;
          }
        }
      }
    }
    return { windowDays, hasAvailableInWindow, timeRows, nextAvailableSlot };
  }, [agenda]);

  useEffect(() => {
    if (!token || user?.role !== "CLIENT") return;
    apiClient
      .mySavedProfessionals(token)
      .then((saved) => setIsSaved(saved.some((p) => p.id === professional.id)))
      .catch(() => {});
  }, [token, user, professional.id]);

  useEffect(() => {
    apiClient
      .getProfessionalAgenda(professional.id)
      .then((res) => {
        // L'agenda è un widget accessorio (mai bloccare l'apertura del
        // profilo per colpa sua): valida la forma della risposta prima di
        // usarla invece di fidarsi ciecamente del tipo dichiarato — un API
        // Railway non ancora allineata all'ultimo deploy del frontend (i due
        // servizi si deployano indipendentemente) potrebbe rispondere ancora
        // con la vecchia forma, e `agenda.days.some(...)` su un valore senza
        // `days` mandava in crash l'intera pagina (bug reale segnalato
        // dall'utente: "Application error" aprendo un profilo).
        if (res && Array.isArray(res.days)) setAgenda(res);
      })
      .catch(() => {});
  }, [professional.id]);

  async function handleToggleSave() {
    if (!token) return;
    setIsSaving(true);
    try {
      if (isSaved) {
        await apiClient.unsaveProfessional(token, professional.id);
        setIsSaved(false);
      } else {
        await apiClient.saveProfessional(token, professional.id);
        setIsSaved(true);
      }
    } catch {
      // silenzioso: non è un'azione critica, l'utente può riprovare
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso}>
      <YStack width="100%" maxWidth={780} paddingHorizontal="$4" paddingVertical="$6" gap="$6">
        <XStack gap="$3" alignItems="flex-start" justifyContent="space-between">
          <XStack gap="$3" alignItems="flex-start" flex={1}>
            <YStack
              cursor={professional.imageUrl ? "pointer" : undefined}
              onPress={() => {
                if (professional.imageUrl) setLightbox({ photos: [professional.imageUrl], index: 0 });
              }}
              accessibilityRole={professional.imageUrl ? "button" : undefined}
              accessibilityLabel={professional.imageUrl ? "Ingrandisci la foto profilo" : undefined}
            >
              <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={64} />
            </YStack>
            <YStack gap="$2" flex={1}>
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
                  {professional.businessName}
                </Text>
                {professional.verified ? <Badge variant="verificato">Verificato</Badge> : null}
                {professional.boosted ? <Badge variant="pro">In evidenza</Badge> : null}
              </XStack>
              <Text fontFamily="$body" fontWeight="700" fontSize={13} color={brand.grafite70}>
                {professional.categoryLabel} · {professional.city}
              </Text>
              {professional.rating !== null ? (
                <Rating value={professional.rating} count={professional.reviewCount} size={16} />
              ) : (
                <Text color={brand.grafite70}>Nessuna recensione ancora</Text>
              )}
            </YStack>
          </XStack>

          {user?.role === "CLIENT" ? (
            <Button
              variant={isSaved ? "primary" : "secondary"}
              size="$3"
              onPress={handleToggleSave}
              disabled={isSaving}
              opacity={isSaving ? 0.6 : 1}
            >
              <XStack alignItems="center" gap="$2">
                <Icon name="heart" size={15} strokeWidth={1.5} color={isSaved ? "white" : brand.grafite} fill={isSaved ? "white" : "none"} />
                <Text color={isSaved ? "white" : brand.grafite} fontWeight="600">
                  {isSaved ? "Salvato" : "Salva"}
                </Text>
              </XStack>
            </Button>
          ) : null}
        </XStack>

        {professional.subTags.length > 0 ? (
          <XStack flexWrap="wrap" gap="$2">
            {professional.subTags.map((tag) => (
              <Chip key={tag}>{tag.replace(/-/g, " ")}</Chip>
            ))}
          </XStack>
        ) : null}

        {professional.bio ? <Text color={brand.grafite70}>{professional.bio}</Text> : null}

        {professional.services.length > 0 ? (
          <YStack gap="$3">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Prestazioni
            </Text>
            <Surface padding={0} overflow="hidden">
              {professional.services.map((service, index) => (
                <XStack
                  key={service.id}
                  justifyContent="space-between"
                  alignItems="center"
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  borderTopWidth={index === 0 ? 0 : 1}
                  borderTopColor={brand.filetto}
                >
                  <Text color={brand.grafite}>{service.name}</Text>
                  <Text fontWeight="600" color={brand.grafite}>
                    {formatServicePriceRange(service.priceMinEurCents, service.priceMaxEurCents)}
                  </Text>
                </XStack>
              ))}
            </Surface>
          </YStack>
        ) : null}

        {/* `?? []`: stessa cautela dell'agenda/recensioni sopra — un'API non
            ancora allineata all'ultimo deploy potrebbe non includere ancora
            portfolioUrls sul professionista. */}
        {(professional.portfolioUrls ?? []).length > 0 ? (
          <YStack gap="$3">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Lavori svolti
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {(professional.portfolioUrls ?? []).map((url, photoIndex) => (
                <YStack
                  key={url}
                  width={96}
                  height={96}
                  borderRadius="$3"
                  overflow="hidden"
                  borderWidth={1}
                  borderColor={brand.filetto}
                  cursor="pointer"
                  onPress={() => setLightbox({ photos: professional.portfolioUrls ?? [], index: photoIndex })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ingrandisci foto ${photoIndex + 1} dei lavori svolti`}
                >
                  <MediaPreview url={url} />
                </YStack>
              ))}
            </XStack>
          </YStack>
        ) : null}

        {agendaPreview && (agendaPreview.hasAvailableInWindow || agendaPreview.nextAvailableSlot) ? (
          <YStack gap="$3">
            {/* Ancora per il click sulle pillole della mini-agenda nei risultati di ricerca
                (ProfessionalCard): scrollMarginTop compensa l'header sticky. */}
            <div id="agenda" style={{ scrollMarginTop: 96 }} />
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Agenda
            </Text>
            <Text fontSize="$2" color={brand.grafite70}>
              Tocca un orario libero per richiedere un preventivo per quella fascia. Gli orari barrati sono già al completo.
            </Text>

            <XStack>
              {agendaPreview.windowDays.map((day) => (
                <YStack key={day.date} width={72} alignItems="center" gap={2}>
                  <Text fontFamily="$body" fontSize={12} fontWeight="700" color={brand.grafite}>
                    {day.label}
                  </Text>
                  <Text fontFamily="$mono" fontSize={11} color={brand.grafite70}>
                    {day.dateLabel}
                  </Text>
                </YStack>
              ))}
            </XStack>

            {agendaPreview.hasAvailableInWindow ? (
              <YStack gap="$1.5">
                {agendaPreview.timeRows.map((time) => (
                  <XStack key={time}>
                    {agendaPreview.windowDays.map((day) => {
                      const slot = day.slots.find((s) => s.startTime === time);
                      if (!slot) {
                        return (
                          <XStack key={day.date} width={72} alignItems="center" justifyContent="center" paddingVertical={4}>
                            <Text fontSize={13} color={brand.filetto}>
                              -
                            </Text>
                          </XStack>
                        );
                      }
                      const isFull = slot.bookedCount >= slot.maxBookings;
                      if (isFull) {
                        return (
                          <XStack key={day.date} width={72} alignItems="center" justifyContent="center" paddingVertical={4}>
                            <Text fontFamily="$mono" fontSize={12} color={brand.grafite70} textDecorationLine="line-through">
                              {slot.startTime}
                            </Text>
                          </XStack>
                        );
                      }
                      const href = `/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&data=${day.date}&fasciaOraria=${slot.startTime}-${slot.endTime}`;
                      return (
                        <XStack key={day.date} width={72} alignItems="center" justifyContent="center" paddingVertical={3}>
                          <Link href={href} style={{ textDecoration: "none" }}>
                            <XStack paddingHorizontal="$2" paddingVertical={4} borderRadius="$10" backgroundColor={brand.cianografiaVelo}>
                              <Text fontFamily="$mono" fontSize={12} fontWeight="700" color={brand.cianografiaScuro}>
                                {slot.startTime}
                              </Text>
                            </XStack>
                          </Link>
                        </XStack>
                      );
                    })}
                  </XStack>
                ))}
              </YStack>
            ) : agendaPreview.nextAvailableSlot ? (
              <YStack gap="$2" padding="$4" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto} alignSelf="flex-start">
                <YStack gap={2}>
                  <Text fontSize={12} color={brand.grafite70}>
                    Prossimo giorno disponibile:
                  </Text>
                  <Text fontSize={14} fontWeight="700" color={brand.grafite}>
                    {agendaPreview.nextAvailableSlot.dateLabel}, {agendaPreview.nextAvailableSlot.startTime}
                  </Text>
                </YStack>
                <Link
                  href={`/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&data=${agendaPreview.nextAvailableSlot.date}&fasciaOraria=${agendaPreview.nextAvailableSlot.startTime}-${agendaPreview.nextAvailableSlot.endTime}`}
                  style={{ textDecoration: "none" }}
                >
                  <XStack alignSelf="flex-start" paddingHorizontal="$4" paddingVertical="$2" borderRadius="$10" backgroundColor={brand.cianografia}>
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color="#FFFFFF">
                      Mostra orari disponibili →
                    </Text>
                  </XStack>
                </Link>
              </YStack>
            ) : null}
          </YStack>
        ) : null}

        <Link
          href={`/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}`}
          style={{ textDecoration: "none", alignSelf: "flex-start" }}
        >
          <Button variant="primary">{`Richiedi un preventivo a ${professional.businessName}`}</Button>
        </Link>

        <YStack gap="$3">
          <YStack flexDirection="row" alignItems="center" gap="$3" flexWrap="wrap">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Recensioni
            </Text>
            {professional.rating !== null ? <Rating value={professional.rating} count={professional.reviewCount} /> : null}
          </YStack>
          {professional.reviews.length === 0 ? (
            <EmptyState icon="star" title="Nessuna recensione ancora" description="Le recensioni arrivano solo da prenotazioni confermate." />
          ) : (
            professional.reviews.map((review) => (
              <Surface key={review.id} gap="$2">
                <XStack alignItems="center" gap="$1">
                  <Icon name="star" size={15} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} />
                  <Text fontWeight="600" color={brand.grafite}>
                    {review.rating}/5
                  </Text>
                </XStack>
                {review.comment ? <Text color={brand.grafite70}>{review.comment}</Text> : null}
                {/* `?? []`: stessa cautela dell'agenda, un'API non ancora allineata all'ultimo deploy
                    potrebbe non includere ancora photoUrls su una recensione. */}
                {(review.photoUrls ?? []).length > 0 ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {(review.photoUrls ?? []).map((url, photoIndex) => (
                      <YStack
                        key={url}
                        width={72}
                        height={72}
                        borderRadius="$3"
                        overflow="hidden"
                        borderWidth={1}
                        borderColor={brand.filetto}
                        cursor="pointer"
                        onPress={() => setLightbox({ photos: review.photoUrls ?? [], index: photoIndex })}
                        accessibilityRole="button"
                        accessibilityLabel={`Ingrandisci foto ${photoIndex + 1} della recensione`}
                      >
                        <MediaPreview url={url} />
                      </YStack>
                    ))}
                  </XStack>
                ) : null}
              </Surface>
            ))
          )}
        </YStack>
      </YStack>

      {lightbox ? (
        <PhotoLightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />
      ) : null}
    </YStack>
  );
}
