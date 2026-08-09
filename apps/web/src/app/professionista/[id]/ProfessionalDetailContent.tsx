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
// Bug reale corretto: a 90px per colonna, 4 colonne (360px) superavano lo
// spazio realmente disponibile su molti schermi da cellulare (padding
// orizzontale della pagina già sottratto, es. ~358px su un viewport di
// 390px, molto meno su un Android stretto da 360px) — la griglia risultava
// tagliata/spinta fuori schermo su dispositivi reali (mai riprodotto in modo
// netto in locale su un solo viewport di test, ma il margine era già troppo
// risicato per essere sicuro). Stessa larghezza colonna della mini-agenda di
// ricerca (`AGENDA_COLUMN_WIDTH` in packages/ui/src/ProfessionalCard.tsx),
// che con lo stesso numero di colonne non aveva mai mostrato il problema.
const AGENDA_COLUMN_WIDTH = 78;
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
  // professionista. `allDays` sono tutti i giorni già scaricati (14,
  // getPublicAgenda): la griglia ne mostra AGENDA_PREVIEW_DAYS alla volta,
  // con frecce avanti/indietro per scorrere senza una richiesta di rete
  // aggiuntiva (richiesta esplicita dell'utente). `nextAvailableSlot` è
  // cercato una sola volta sull'intera finestra di 14 giorni, usato solo
  // come scorciatoia quando la primissima finestra (offset 0) è vuota.
  // Tab "A domicilio"/"Online" (richiesta esplicita dell'utente, stesso
  // pattern della mini-agenda di ricerca): filtrano gli orari mostrati sotto
  // in base alla modalità offerta su ogni fascia (slot.home/slot.online,
  // null quando quel tipo non è offerto).
  const [agendaMode, setAgendaMode] = useState<"HOME" | "ONLINE">("HOME");

  const agendaPreview = useMemo(() => {
    if (!agenda) return null;
    const allDays = agenda.days.map((day, offset) => ({
      date: day.date,
      label: agendaDayLabel(offset, day.dayOfWeek),
      dateLabel: agendaDateLabel(day.date),
      slots: day.slots,
    }));
    const isAvailable = (slot: (typeof allDays)[number]["slots"][number]) => {
      const mode = agendaMode === "HOME" ? slot.home : slot.online;
      return mode !== null && mode.bookedCount < mode.maxBookings;
    };
    const initialHasAvailable = allDays.slice(0, AGENDA_PREVIEW_DAYS).some((day) => day.slots.some(isAvailable));
    let nextAvailableSlot: { date: string; dateLabel: string; startTime: string; endTime: string } | null = null;
    if (!initialHasAvailable) {
      outer: for (const day of allDays) {
        for (const slot of [...day.slots].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
          if (isAvailable(slot)) {
            nextAvailableSlot = { date: day.date, dateLabel: day.dateLabel, startTime: slot.startTime, endTime: slot.endTime };
            break outer;
          }
        }
      }
    }
    return { allDays, initialHasAvailable, nextAvailableSlot };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, agendaMode]);

  const [agendaWindowOffset, setAgendaWindowOffset] = useState(0);
  const totalAgendaDays = agendaPreview?.allDays.length ?? 0;
  const maxAgendaOffset = Math.max(0, totalAgendaDays - AGENDA_PREVIEW_DAYS);
  const agendaOffset = Math.min(agendaWindowOffset, maxAgendaOffset);
  const agendaWindowDaysRaw = agendaPreview?.allDays.slice(agendaOffset, agendaOffset + AGENDA_PREVIEW_DAYS) ?? [];
  // Filtrati alla sola modalità attiva: le fasce che non offrono quel tipo
  // di intervento restano fuori, come se non esistessero per questo tab.
  const agendaWindowDays = agendaWindowDaysRaw.map((day) => ({
    ...day,
    slots: day.slots.filter((slot) => (agendaMode === "HOME" ? slot.home : slot.online) !== null),
  }));
  const agendaHasAvailableInWindow = agendaWindowDays.some((day) =>
    day.slots.some((slot) => {
      const mode = agendaMode === "HOME" ? slot.home : slot.online;
      return mode !== null && mode.bookedCount < mode.maxBookings;
    }),
  );
  const agendaTimeRows = agendaHasAvailableInWindow
    ? Array.from(new Set(agendaWindowDays.flatMap((day) => day.slots.map((slot) => slot.startTime)))).sort()
    : [];
  const agendaCanGoBack = agendaOffset > 0;
  const agendaCanGoForward = agendaOffset + AGENDA_PREVIEW_DAYS < totalAgendaDays;

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
              {professional.completedThisMonth > 0 ? (
                <Text fontSize={13} color={brand.verificato} fontWeight="600">
                  Ha completato {professional.completedThisMonth} {professional.completedThisMonth === 1 ? "intervento" : "interventi"} questo
                  mese
                </Text>
              ) : null}
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

        {agendaPreview && (agendaPreview.initialHasAvailable || agendaPreview.nextAvailableSlot) ? (
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

            {/* Tab "A domicilio"/"Online" (richiesta esplicita dell'utente):
                filtrano gli orari sotto in base alla modalità offerta su
                ogni fascia. */}
            <XStack gap="$2">
              {(["HOME", "ONLINE"] as const).map((mode) => (
                <XStack
                  key={mode}
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$10"
                  backgroundColor={agendaMode === mode ? brand.cianografia : brand.gesso}
                  cursor="pointer"
                  accessibilityRole="button"
                  accessibilityLabel={mode === "HOME" ? "A domicilio" : "Online"}
                  onPress={() => {
                    setAgendaMode(mode);
                    setAgendaWindowOffset(0);
                  }}
                >
                  <Text fontFamily="$body" fontSize={13} fontWeight="700" color={agendaMode === mode ? "#FFFFFF" : brand.grafite70}>
                    {mode === "HOME" ? "A domicilio" : "Online"}
                  </Text>
                </XStack>
              ))}
            </XStack>

            {totalAgendaDays > AGENDA_PREVIEW_DAYS ? (
              // Frecce su una riga propria, sopra le intestazioni giorno e
              // allineate a destra (richiesta esplicita dell'utente: prima
              // condividevano la riga con le intestazioni ed erano soggette
              // allo stesso `flexWrap` di quel blocco, finendo sotto o
              // troppo vicine al bordo su schermi stretti). Un blocco fisso
              // di soli ~88px allineato a destra non compete mai per lo
              // spazio con le 4 colonne della griglia sottostante, quindi
              // non sfora mai il bordo del telefono. Stessa resa già in uso
              // per le frecce del carosello categorie (CategoryCarousel.tsx:
              // 40×40, cerchio pieno brand.calce, nessun bordo/ombra).
              <XStack justifyContent="flex-end" gap="$2" alignItems="center">
                <XStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  backgroundColor={brand.calce}
                  alignItems="center"
                  justifyContent="center"
                  opacity={agendaCanGoBack ? 1 : 0.3}
                  cursor={agendaCanGoBack ? "pointer" : undefined}
                  accessibilityRole={agendaCanGoBack ? "button" : undefined}
                  accessibilityLabel="Giorni precedenti"
                  onPress={agendaCanGoBack ? () => setAgendaWindowOffset(Math.max(0, agendaOffset - AGENDA_PREVIEW_DAYS)) : undefined}
                >
                  <Icon name="chevron-left" size={20} color={brand.grafite} />
                </XStack>
                <XStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  backgroundColor={brand.calce}
                  alignItems="center"
                  justifyContent="center"
                  opacity={agendaCanGoForward ? 1 : 0.3}
                  cursor={agendaCanGoForward ? "pointer" : undefined}
                  accessibilityRole={agendaCanGoForward ? "button" : undefined}
                  accessibilityLabel="Giorni successivi"
                  onPress={agendaCanGoForward ? () => setAgendaWindowOffset(agendaOffset + AGENDA_PREVIEW_DAYS) : undefined}
                >
                  <Icon name="chevron-right" size={20} color={brand.grafite} />
                </XStack>
              </XStack>
            ) : null}

            <XStack>
              {agendaWindowDays.map((day) => (
                <YStack key={day.date} width={AGENDA_COLUMN_WIDTH} flexShrink={0} alignItems="center" gap={2}>
                  <Text fontFamily="$body" fontSize={12} fontWeight="700" color={brand.grafite}>
                    {day.label}
                  </Text>
                  <Text fontFamily="$mono" fontSize={11} color={brand.grafite70}>
                    {day.dateLabel}
                  </Text>
                </YStack>
              ))}
            </XStack>

            {agendaHasAvailableInWindow ? (
              <YStack gap="$1.5">
                {agendaTimeRows.map((time) => (
                  <XStack key={time}>
                    {agendaWindowDays.map((day) => {
                      const slot = day.slots.find((s) => s.startTime === time);
                      if (!slot) {
                        return (
                          <XStack
                            key={day.date}
                            width={AGENDA_COLUMN_WIDTH}
                            flexShrink={0}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical={4}
                          >
                            <Text fontSize={13} color={brand.filetto}>
                              -
                            </Text>
                          </XStack>
                        );
                      }
                      const range = `${slot.startTime}–${slot.endTime}`;
                      const modeInfo = agendaMode === "HOME" ? slot.home : slot.online;
                      const isFull = !modeInfo || modeInfo.bookedCount >= modeInfo.maxBookings;
                      if (isFull) {
                        return (
                          <XStack
                            key={day.date}
                            width={AGENDA_COLUMN_WIDTH}
                            flexShrink={0}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical={4}
                          >
                            <Text
                              fontFamily="$mono"
                              fontSize={11.5}
                              color={brand.grafite70}
                              textDecorationLine="line-through"
                              textAlign="center"
                            >
                              {range}
                            </Text>
                          </XStack>
                        );
                      }
                      const href = `/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&data=${day.date}&fasciaOraria=${slot.startTime}-${slot.endTime}&modalita=${agendaMode}`;
                      return (
                        <XStack
                          key={day.date}
                          width={AGENDA_COLUMN_WIDTH}
                          flexShrink={0}
                          alignItems="center"
                          justifyContent="center"
                          paddingVertical={3}
                        >
                          <Link href={href} style={{ textDecoration: "none" }}>
                            <XStack paddingHorizontal="$2" paddingVertical={4} borderRadius="$10" backgroundColor={brand.cianografiaVelo}>
                              <Text fontFamily="$mono" fontSize={11.5} fontWeight="700" color={brand.cianografiaScuro} textAlign="center">
                                {range}
                              </Text>
                            </XStack>
                          </Link>
                        </XStack>
                      );
                    })}
                  </XStack>
                ))}
              </YStack>
            ) : agendaOffset === 0 && agendaPreview.nextAvailableSlot ? (
              <YStack gap="$2" padding="$4" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto} alignSelf="flex-start">
                <YStack gap={2}>
                  <Text fontSize={12} color={brand.grafite70}>
                    Prossimo giorno disponibile:
                  </Text>
                  <Text fontSize={14} fontWeight="700" color={brand.grafite}>
                    {agendaPreview.nextAvailableSlot.dateLabel}, {agendaPreview.nextAvailableSlot.startTime}–
                    {agendaPreview.nextAvailableSlot.endTime}
                  </Text>
                </YStack>
                <Link
                  href={`/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&data=${agendaPreview.nextAvailableSlot.date}&fasciaOraria=${agendaPreview.nextAvailableSlot.startTime}-${agendaPreview.nextAvailableSlot.endTime}&modalita=${agendaMode}`}
                  style={{ textDecoration: "none" }}
                >
                  <XStack alignSelf="flex-start" paddingHorizontal="$4" paddingVertical="$2" borderRadius="$10" backgroundColor={brand.cianografia}>
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color="#FFFFFF">
                      Mostra orari disponibili →
                    </Text>
                  </XStack>
                </Link>
              </YStack>
            ) : (
              <Text fontSize="$2" color={brand.grafite70}>
                Nessun orario libero in questi giorni.
              </Text>
            )}
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
                <XStack alignItems="center" gap="$2" flexWrap="wrap">
                  <XStack alignItems="center" gap="$1">
                    <Icon name="star" size={15} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} />
                    <Text fontWeight="600" color={brand.grafite}>
                      {review.rating}/5
                    </Text>
                  </XStack>
                  {review.isAutomatic ? (
                    <Text fontSize="$2" color={brand.grafite70} fontStyle="italic">
                      (recensione automatica)
                    </Text>
                  ) : null}
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
