"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { formatServicePriceRange, type ProfessionalAvailableSlot, type ProfessionalBooking, type ProfessionalLead } from "@professionisti/shared";
import { Badge, Button, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";
import { ClientProfileModal } from "@/components/ClientProfileModal";

const smallInputStyle = { padding: 10, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit", color: brand.grafite };

function SectionTitle({ children }: { children: string }) {
  return (
    <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
      {children}
    </Text>
  );
}

export default function DashboardPage() {
  const { user, token, isLoading } = useAuth();
  const [profileMissing, setProfileMissing] = useState(false);
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  // Fasce libere della propria agenda (prossimi 14gg): usate nel form
  // preventivo per far scegliere la data di inizio dentro la disponibilità
  // reale invece di una data libera scollegata — richiesta esplicita
  // dell'utente. Caricate una sola volta qui e passate a tutte le
  // LeadCard, non una chiamata per card.
  const [availableSlots, setAvailableSlots] = useState<ProfessionalAvailableSlot[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reloadLeads() {
    if (!token) return;
    apiClient.myLeads(token).then(setLeads);
  }

  useEffect(() => {
    if (!token) return;
    Promise.all([apiClient.myLeads(token), apiClient.myProfessionalBookings(token), apiClient.myAvailableSlots(token)])
      .then(([leadsResult, bookingsResult, slotsResult]) => {
        setLeads(leadsResult);
        setBookings(bookingsResult);
        setAvailableSlots(slotsResult);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("profilo")) {
          setProfileMissing(true);
        } else {
          setError(err instanceof Error ? err.message : "Errore nel caricamento della dashboard.");
        }
      });
  }, [token]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "PROFESSIONAL") {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <Text color={brand.grafite70}>Questa sezione è riservata ai professionisti.</Text>
      </YStack>
    );
  }

  if (profileMissing) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Completa il tuo profilo per iniziare
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Serve un profilo completo (nome attività, categoria, città) per comparire in ricerca e ricevere
            richieste.
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button variant="primary">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={780} gap="$6">
        <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Dashboard
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Modifica profilo
            </Text>
          </Link>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        <YStack gap="$3">
          <SectionTitle>Richieste ricevute</SectionTitle>
          {leads === null ? (
            <LoadingState />
          ) : leads.length === 0 ? (
            <Text color={brand.grafite70}>Non hai ancora ricevuto richieste. Torna a trovarci a breve!</Text>
          ) : (
            leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} token={token} availableSlots={availableSlots} onChanged={reloadLeads} />
            ))
          )}
        </YStack>

        <BoostSection token={token} />

        <YStack gap="$3">
          <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
            <SectionTitle>Lavori accettati</SectionTitle>
            <Link href="/dashboard/agenda" style={{ textDecoration: "none" }}>
              <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                Apri il calendario completo
              </Text>
            </Link>
          </YStack>
          <Text fontSize="$2" color={brand.grafite70}>
            Preventivi accettati e lavori in agenda, con i dati del cliente per andare a svolgere l&apos;intervento.
          </Text>
          {bookings === null ? (
            <LoadingState />
          ) : acceptedJobs(bookings).length === 0 ? (
            <Text color={brand.grafite70}>Nessun lavoro accettato per ora.</Text>
          ) : (
            <YStack gap="$3">
              {acceptedJobs(bookings).map((booking) => (
                <AcceptedJobCard key={booking.id} booking={booking} />
              ))}
            </YStack>
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}

/**
 * "Lavori accettati" (richiesta esplicita dell'utente): prenotazioni
 * CONFIRMED (preventivo accettato dal cliente, o fascia diretta già
 * confermata dal professionista) o COMPLETED (lavori passati) — non
 * PENDING (prenotazione diretta da agenda pubblica ancora da confermare, non
 * ancora davvero "accettata" da questo lato) né CANCELED/NO_SHOW.
 */
function acceptedJobs(bookings: ProfessionalBooking[]): ProfessionalBooking[] {
  return bookings.filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED");
}

function AcceptedJobCard({ booking }: { booking: ProfessionalBooking }) {
  const date = new Date(booking.scheduledAt);
  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1">
          <Text fontWeight="700" color={brand.grafite}>
            {date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text fontFamily="$mono" fontSize={11} fontWeight="700" letterSpacing={0.5} textTransform="uppercase" color={booking.status === "COMPLETED" ? brand.grafite70 : brand.verificato}>
            {booking.status === "COMPLETED" ? "Completato" : "Confermato"}
          </Text>
        </YStack>
      </YStack>

      <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
        <Text fontWeight="600" color={brand.grafite}>
          {booking.clientName ?? "Cliente"}
        </Text>
        {booking.clientPhone ? (
          <a href={`tel:${booking.clientPhone}`} style={{ textDecoration: "none" }}>
            <XStack alignItems="center" gap="$1">
              <Icon name="phone" size={12} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                {booking.clientPhone}
              </Text>
            </XStack>
          </a>
        ) : null}
        {booking.clientEmail ? (
          <a href={`mailto:${booking.clientEmail}`} style={{ textDecoration: "none" }}>
            <XStack alignItems="center" gap="$1">
              <Icon name="mail" size={12} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                {booking.clientEmail}
              </Text>
            </XStack>
          </a>
        ) : null}
        {booking.address ? (
          <XStack alignItems="center" gap="$1">
            <Icon name="map-pin" size={12} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" color={brand.grafite70}>
              {booking.address}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      {booking.items.length > 0 ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          {booking.items.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize="$2" color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize="$2" color={brand.grafite} fontWeight="600">
                {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
              </Text>
            </XStack>
          ))}
        </YStack>
      ) : null}
    </Surface>
  );
}

const BOOST_OPTIONS: { type: "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO"; label: string; description: string; priceEur: number }[] = [
  { type: "BOOST_LOCALE", label: "Boost locale", description: "Prime posizioni nei risultati per 30 giorni.", priceEur: 19.9 },
  { type: "BADGE_REPUTAZIONE", label: "Badge reputazione", description: "Evidenza per rating alto e risposta rapida.", priceEur: 9.9 },
  { type: "STORIA_SUCCESSO", label: "Storia di successo", description: "Contenuto editoriale in evidenza sulla piattaforma.", priceEur: 49.9 },
];

function BoostSection({ token }: { token: string }) {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(type: (typeof BOOST_OPTIONS)[number]["type"]) {
    setError(null);
    setLoadingType(type);
    try {
      const { url } = await apiClient.createBoostCheckout(token, type);
      if (url) {
        window.location.href = url;
      } else {
        setError("Checkout non disponibile al momento.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <YStack gap="$3">
      <SectionTitle>Aumenta la tua visibilità</SectionTitle>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
        {BOOST_OPTIONS.map((option) => (
          <Surface key={option.type} flex={1} gap="$2">
            <Badge variant="pro">{option.label}</Badge>
            <Text color={brand.grafite70} fontSize="$3">
              {option.description}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              €{option.priceEur.toFixed(2)}
            </Text>
            <Button
              variant="secondary"
              size="$3"
              height={40}
              alignSelf="flex-start"
              onPress={() => handleBuy(option.type)}
              disabled={loadingType === option.type}
              opacity={loadingType === option.type ? 0.6 : 1}
            >
              {loadingType === option.type ? "Attendi..." : "Acquista"}
            </Button>
          </Surface>
        ))}
      </YStack>
    </YStack>
  );
}

type QuoteItemDraft = { name: string; priceMin: string; priceMax: string };

/** Codifica una fascia come chiave selezionabile in un <select>, decodificata al momento dell'invio. */
function slotKey(slot: ProfessionalAvailableSlot): string {
  return `${slot.date}|${slot.startTime}|${slot.endTime}`;
}

function slotLabel(slot: ProfessionalAvailableSlot): string {
  const date = new Date(`${slot.date}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${dateLabel} · ${slot.startTime}–${slot.endTime}`;
}

function LeadCard({
  lead,
  token,
  availableSlots,
  onChanged,
}: {
  lead: ProfessionalLead;
  token: string;
  /** Fasce esatte libere della propria agenda (prossimi 14gg): usate per scegliere la data di inizio invece di una data libera. */
  availableSlots: ProfessionalAvailableSlot[];
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  // Una voce di default ("Manodopera") già pronta, il professionista può
  // rinominarla/rimuoverla e aggiungerne altre (es. "Materiali", "Trasporto")
  // — ogni voce ha il proprio range di prezzo, non più due campi fissi
  // manodopera/materiali — richiesta esplicita dell'utente.
  const [items, setItems] = useState<QuoteItemDraft[]>([{ name: "Manodopera", priceMin: "", priceMax: "" }]);
  const [selectedSlotKey, setSelectedSlotKey] = useState(availableSlots[0] ? slotKey(availableSlots[0]) : "");
  // Ripiego se l'agenda non ha fasce esatte libere nei prossimi 14gg (es.
  // professionista che non l'ha ancora impostata): una data libera come
  // prima, per non bloccare comunque l'invio del preventivo.
  const [fallbackDate, setFallbackDate] = useState("");
  const [notes, setNotes] = useState("");
  const sent = lead.quote !== null;
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDate, setIsConfirmingDate] = useState(false);
  const [isRejectingDate, setIsRejectingDate] = useState(false);
  const [showClientProfile, setShowClientProfile] = useState(false);
  const clientName = lead.guidedRequest.clientName ?? "Cliente";

  function updateItem(index: number, field: "name" | "priceMin" | "priceMax", value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendQuote() {
    setError(null);

    const cleanedItems = items.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name.length > 0);
    if (cleanedItems.length === 0) {
      setError("Aggiungi almeno una voce al preventivo.");
      return;
    }

    const parsedItems: { name: string; priceMinEurCents?: number; priceMaxEurCents?: number }[] = [];
    for (const item of cleanedItems) {
      const priceMinEurCents = item.priceMin.trim() ? Math.round(Number(item.priceMin.replace(",", ".")) * 100) : undefined;
      const priceMaxEurCents = item.priceMax.trim() ? Math.round(Number(item.priceMax.replace(",", ".")) * 100) : undefined;
      if (item.priceMin.trim() && !Number.isFinite(priceMinEurCents)) {
        setError(`Prezzo minimo non valido per "${item.name}".`);
        return;
      }
      if (item.priceMax.trim() && !Number.isFinite(priceMaxEurCents)) {
        setError(`Prezzo massimo non valido per "${item.name}".`);
        return;
      }
      if (priceMinEurCents === undefined && priceMaxEurCents === undefined) {
        setError(`Indica almeno un prezzo per "${item.name}".`);
        return;
      }
      if (priceMinEurCents !== undefined && priceMaxEurCents !== undefined && priceMaxEurCents < priceMinEurCents) {
        setError(`Il prezzo massimo di "${item.name}" dev'essere maggiore o uguale al minimo.`);
        return;
      }
      parsedItems.push({ name: item.name, priceMinEurCents, priceMaxEurCents });
    }

    let estimatedStartDate: string;
    if (availableSlots.length > 0) {
      const slot = availableSlots.find((s) => slotKey(s) === selectedSlotKey);
      if (!slot) {
        setError("Scegli un orario dalla tua agenda.");
        return;
      }
      estimatedStartDate = new Date(`${slot.date}T${slot.startTime}:00.000Z`).toISOString();
    } else {
      if (!fallbackDate) {
        setError("Indica una data di inizio stimata.");
        return;
      }
      estimatedStartDate = new Date(fallbackDate).toISOString();
    }

    setIsSubmitting(true);
    try {
      await apiClient.createQuote(token, {
        requestId: lead.guidedRequest.id,
        items: parsedItems,
        estimatedStartDate,
        notes: notes.trim() || undefined,
      });
      setShowForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDate() {
    if (!lead.quote) return;
    setError(null);
    setIsConfirmingDate(true);
    try {
      await apiClient.confirmProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsConfirmingDate(false);
    }
  }

  async function handleRejectDate() {
    if (!lead.quote) return;
    setError(null);
    setIsRejectingDate(true);
    try {
      await apiClient.rejectProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsRejectingDate(false);
    }
  }

  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" flex={1}>
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            {/* Nome del cliente, cliccabile: apre la scheda profilo minimale
                (richiesta esplicita dell'utente). Nessuna pagina pubblica
                per i clienti in questo marketplace (a differenza dei
                professionisti, /professionista/[id]): la scheda è un
                overlay, non una navigazione. */}
            <Text
              fontWeight="700"
              color={brand.cianografia}
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setShowClientProfile(true)}
            >
              {clientName}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              · {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.city}
            </Text>
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
          </XStack>
          <Text color={brand.grafite70}>{lead.guidedRequest.description}</Text>
          {lead.guidedRequest.address ? (
            <XStack alignItems="center" gap="$1">
              <Icon name="map-pin" size={12} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.grafite70}>
                {lead.guidedRequest.address}
              </Text>
            </XStack>
          ) : null}
        </YStack>
        {sent && lead.quote?.status !== "MODIFICATION_REQUESTED" ? (
          <Text fontSize="$2" color={brand.verificato} fontWeight="600">
            {lead.quote?.status === "ACCEPTED" ? "Preventivo accettato" : "Preventivo inviato"}
          </Text>
        ) : null}
      </YStack>

      {lead.quote?.status === "MODIFICATION_REQUESTED" && lead.quote.clientProposedDate ? (
        <YStack
          gap="$2"
          borderWidth={1}
          borderColor={brand.ottone}
          backgroundColor={brand.calce}
          borderRadius="$3"
          padding="$3"
        >
          <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
            Il cliente ha proposto un&apos;altra data:{" "}
            {new Date(lead.quote.clientProposedDate).toLocaleDateString("it-IT", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
            {" · "}
            {new Date(lead.quote.clientProposedDate).toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            })}
          </Text>
          {lead.quote.clientProposedNote ? (
            <Text fontSize="$3" color={brand.grafite70}>
              {lead.quote.clientProposedNote}
            </Text>
          ) : null}
          <XStack gap="$2">
            <Button
              variant="secondary"
              size="$3"
              height={40}
              onPress={handleConfirmDate}
              disabled={isConfirmingDate || isRejectingDate}
              opacity={isConfirmingDate ? 0.6 : 1}
            >
              {isConfirmingDate ? "Conferma..." : "Conferma questa data"}
            </Button>
            <Button
              variant="ghost"
              size="$3"
              height={40}
              onPress={handleRejectDate}
              disabled={isConfirmingDate || isRejectingDate}
              opacity={isRejectingDate ? 0.6 : 1}
            >
              {isRejectingDate ? "Rifiuto..." : "Rifiuta"}
            </Button>
          </XStack>
        </YStack>
      ) : null}

      {lead.guidedRequest.photoUrls.length > 0 ? (
        <XStack gap="$2" flexWrap="wrap">
          {lead.guidedRequest.photoUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${brand.filetto}` }}
            />
          ))}
        </XStack>
      ) : null}

      {!sent && !showForm ? (
        <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowForm(true)}>
          Invia preventivo
        </Button>
      ) : null}

      {showForm ? (
        <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
          <YStack gap="$2">
            <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
              Voci del preventivo
            </Text>
            {items.map((item, index) => (
              <YStack key={index} flexDirection="row" gap="$2" alignItems="center" flexWrap="wrap">
                <input
                  value={item.name}
                  onChange={(e) => updateItem(index, "name", e.target.value)}
                  placeholder="Es. Manodopera"
                  style={{ ...smallInputStyle, flex: 1, minWidth: 140 }}
                />
                <input
                  value={item.priceMin}
                  onChange={(e) => updateItem(index, "priceMin", e.target.value)}
                  placeholder="Da €"
                  inputMode="decimal"
                  style={{ ...smallInputStyle, width: 90 }}
                />
                <Text fontSize="$2" color={brand.grafite70}>
                  a
                </Text>
                <input
                  value={item.priceMax}
                  onChange={(e) => updateItem(index, "priceMax", e.target.value)}
                  placeholder="A €"
                  inputMode="decimal"
                  style={{ ...smallInputStyle, width: 90 }}
                />
                {items.length > 1 ? (
                  <Button variant="ghost" size="$2" height={36} onPress={() => removeItem(index)} accessibilityLabel="Rimuovi voce">
                    <X size={14} strokeWidth={1.5} color={brand.grafite} />
                  </Button>
                ) : null}
              </YStack>
            ))}
            <Button
              variant="ghost"
              size="$2"
              height={36}
              alignSelf="flex-start"
              onPress={() => setItems((prev) => [...prev, { name: "", priceMin: "", priceMax: "" }])}
            >
              + Aggiungi voce
            </Button>
          </YStack>
          <YStack gap="$1">
            <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
              Data di inizio
            </Text>
            {availableSlots.length > 0 ? (
              <select
                value={selectedSlotKey}
                onChange={(e) => setSelectedSlotKey(e.target.value)}
                style={{ ...smallInputStyle, alignSelf: "flex-start" }}
              >
                {availableSlots.map((slot) => (
                  <option key={slotKey(slot)} value={slotKey(slot)}>
                    {slotLabel(slot)}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="date"
                  value={fallbackDate}
                  onChange={(e) => setFallbackDate(e.target.value)}
                  style={{ ...smallInputStyle, alignSelf: "flex-start" }}
                />
                <Text fontSize="$1" color={brand.grafite70}>
                  Nessun orario libero nei prossimi 14 giorni nella tua agenda — imposta le tue fasce in{" "}
                  <Link href="/dashboard/agenda" style={{ color: brand.cianografia }}>
                    Agenda
                  </Link>{" "}
                  per scegliere direttamente da lì.
                </Text>
              </>
            )}
          </YStack>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note per il cliente (opzionale)"
            rows={2}
            style={{ ...smallInputStyle, resize: "vertical" }}
          />
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
          <Button variant="primary" size="$3" height={40} alignSelf="flex-start" onPress={handleSendQuote} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Invio..." : "Conferma preventivo"}
          </Button>
        </YStack>
      ) : null}

      {showClientProfile ? <ClientProfileModal name={clientName} onClose={() => setShowClientProfile(false)} /> : null}
    </Surface>
  );
}
