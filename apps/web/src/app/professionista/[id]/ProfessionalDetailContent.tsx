"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatServicePriceRange, type ProfessionalAgenda, type ProfessionalDetail } from "@professionisti/shared";
import { Badge, Button, Chip, EmptyState, Icon, Rating, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export function ProfessionalDetailContent({ professional }: { professional: ProfessionalDetail }) {
  const { user, token } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(null);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

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

  async function handleBookSlot(date: string, startTime: string, endTime: string) {
    if (!token) return;
    const slotKey = `${date}-${startTime}`;
    setBookingError(null);
    setBookingSuccess(false);
    setBookingSlot(slotKey);
    try {
      await apiClient.bookAgendaSlot(token, professional.id, { date, startTime, endTime });
      setBookingSuccess(true);
      // Segna subito la fascia come prenotata in locale, invece di rifare la
      // fetch dell'agenda: la stessa richiesta appena inviata è già la fonte
      // di verità per questo slot.
      setAgenda((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((day) =>
                day.date === date
                  ? { ...day, slots: day.slots.map((slot) => (slot.startTime === startTime ? { ...slot, bookedCount: slot.maxBookings } : slot)) }
                  : day,
              ),
            }
          : prev,
      );
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setBookingSlot(null);
    }
  }

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
              <Text fontFamily="$mono" fontSize={13} textTransform="uppercase" color={brand.grafite70}>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </YStack>
              ))}
            </XStack>
          </YStack>
        ) : null}

        {agenda && agenda.days.some((day) => day.slots.length > 0) ? (
          <YStack gap="$3">
            {/* Ancora per il click sulle pillole della mini-agenda nei risultati di ricerca
                (ProfessionalCard): scrollMarginTop compensa l'header sticky. */}
            <div id="agenda" style={{ scrollMarginTop: 96 }} />
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Agenda
            </Text>
            <Text fontSize="$2" color={brand.grafite70}>
              {agenda.bookableAgenda
                ? "Tocca un orario libero per prenotare subito. Le fasce barrate sono già prenotate."
                : "Orari disponibili nei prossimi giorni. Le fasce barrate sono già prenotate."}
            </Text>
            <YStack gap="$2">
              {agenda.days
                .filter((day) => day.slots.length > 0)
                .map((day) => (
                  <XStack key={day.date} gap="$3" alignItems="flex-start" flexWrap="wrap">
                    <Text fontFamily="$mono" fontSize={12} textTransform="uppercase" color={brand.grafite70} width={110} flexShrink={0}>
                      {/* Data UTC (vedi getPublicAgenda lato API): formattata così com'è, senza conversione di
                          fuso — coerente con come scheduledAt viene già trattato nel resto del progetto. */}
                      {new Date(`${day.date}T00:00:00Z`).toLocaleDateString("it-IT", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </Text>
                    <XStack gap="$2" flexWrap="wrap" flex={1}>
                      {day.slots.map((slot) => {
                        const isGeneric = slot.maxBookings > 1;
                        const isFull = slot.bookedCount >= slot.maxBookings;
                        const slotKey = `${day.date}-${slot.startTime}`;

                        if (isGeneric) {
                          // Fascia a capienza: un click non prenota nulla, apre
                          // una richiesta di preventivo precompilata con
                          // data+fascia — sempre raggiungibile (non richiede
                          // bookableAgenda, che governa solo la prenotazione
                          // istantanea delle fasce esatte), finché c'è
                          // capienza residua.
                          const href = `/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&data=${day.date}&fasciaOraria=${slot.startTime}-${slot.endTime}`;
                          return (
                            <YStack
                              key={slotKey}
                              paddingHorizontal="$2"
                              paddingVertical="$1"
                              borderRadius="$2"
                              borderWidth={1}
                              borderStyle="dashed"
                              borderColor={isFull ? brand.filetto : brand.ottone}
                              backgroundColor={isFull ? brand.gesso : brand.calce}
                              opacity={isFull ? 0.7 : 1}
                            >
                              {isFull ? (
                                <Text fontFamily="$mono" fontSize={12} color={brand.grafite70}>
                                  {slot.startTime}–{slot.endTime} · al completo
                                </Text>
                              ) : (
                                <Link href={href} style={{ textDecoration: "none" }}>
                                  <Text fontFamily="$mono" fontSize={12} color={brand.ottone} fontWeight="700">
                                    {slot.startTime}–{slot.endTime} · {slot.bookedCount}/{slot.maxBookings} richieste
                                  </Text>
                                </Link>
                              )}
                            </YStack>
                          );
                        }

                        const canBook = agenda.bookableAgenda && !isFull && !!token && user?.role === "CLIENT";
                        return (
                          <YStack
                            key={slotKey}
                            paddingHorizontal="$2"
                            paddingVertical="$1"
                            borderRadius="$2"
                            borderWidth={1}
                            borderColor={isFull ? brand.filetto : brand.verificato}
                            backgroundColor={isFull ? brand.gesso : "#E6F4EC"}
                            cursor={canBook ? "pointer" : undefined}
                            opacity={bookingSlot === slotKey ? 0.6 : 1}
                            onPress={canBook ? () => handleBookSlot(day.date, slot.startTime, slot.endTime) : undefined}
                            accessibilityRole={canBook ? "button" : undefined}
                            accessibilityLabel={canBook ? `Prenota la fascia ${slot.startTime}–${slot.endTime}` : undefined}
                          >
                            <Text
                              fontFamily="$mono"
                              fontSize={12}
                              color={isFull ? brand.grafite70 : brand.verificato}
                              textDecorationLine={isFull ? "line-through" : "none"}
                              fontWeight={canBook ? "700" : "400"}
                            >
                              {slot.startTime}–{slot.endTime}
                            </Text>
                          </YStack>
                        );
                      })}
                    </XStack>
                  </XStack>
                ))}
            </YStack>
            {agenda.bookableAgenda && (!token || user?.role !== "CLIENT") ? (
              <Text fontSize="$2" color={brand.grafite70}>
                Accedi come cliente per prenotare direttamente da questi orari.
              </Text>
            ) : null}
            {bookingError ? (
              <Text color={brand.urgenza} fontSize="$2">
                {bookingError}
              </Text>
            ) : null}
            {bookingSuccess ? (
              <Text color={brand.verificato} fontSize="$2">
                Prenotazione inviata! La trovi in &quot;Le mie visite&quot;.
              </Text>
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
