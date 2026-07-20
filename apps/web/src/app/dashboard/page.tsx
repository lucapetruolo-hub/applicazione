"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProfessionalBooking, ProfessionalLead } from "@professionisti/shared";
import { Button, H1, H2, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const BOOKING_STATUS_LABEL: Record<ProfessionalBooking["status"], string> = {
  PENDING: "In attesa",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Cliente non presentato",
};

export default function DashboardPage() {
  const { user, token, isLoading } = useAuth();
  const [profileMissing, setProfileMissing] = useState(false);
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([apiClient.myLeads(token), apiClient.myProfessionalBookings(token)])
      .then(([leadsResult, bookingsResult]) => {
        setLeads(leadsResult);
        setBookings(bookingsResult);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("profilo")) {
          setProfileMissing(true);
        } else {
          setError(err instanceof Error ? err.message : "Errore nel caricamento della dashboard.");
        }
      });
  }, [token]);

  async function handleCompleteBooking(bookingId: string) {
    if (!token) return;
    try {
      await apiClient.updateBookingStatus(token, bookingId, "COMPLETED");
      setBookings((prev) => (prev ? prev.map((b) => (b.id === bookingId ? { ...b, status: "COMPLETED" } : b)) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    }
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi come professionista
          </H1>
          <Link href="/accedi?redirect=/dashboard" style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "PROFESSIONAL") {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <Paragraph color="$color10">Questa sezione è riservata ai professionisti.</Paragraph>
      </YStack>
    );
  }

  if (profileMissing) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Completa il tuo profilo per iniziare
          </H1>
          <Paragraph color="$color10" textAlign="center">
            Serve un profilo completo (nome attività, categoria, città) per comparire in ricerca e ricevere
            richieste.
          </Paragraph>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button size="$5">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={780} gap="$6">
        <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
          <H1 size="$8">Dashboard</H1>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Text color="$blue10" fontWeight="600">
              Modifica profilo
            </Text>
          </Link>
        </YStack>

        {error ? <Text color="$red10">{error}</Text> : null}

        <YStack gap="$3">
          <H2 size="$7">Richieste ricevute</H2>
          {leads === null ? (
            <Text color="$color9">Caricamento...</Text>
          ) : leads.length === 0 ? (
            <Paragraph color="$color10">Non hai ancora ricevuto richieste. Torna a trovarci a breve!</Paragraph>
          ) : (
            leads.map((lead) => <LeadCard key={lead.id} lead={lead} token={token} />)
          )}
        </YStack>

        <BoostSection token={token} />

        <YStack gap="$3">
          <H2 size="$7">Agenda</H2>
          {bookings === null ? (
            <Text color="$color9">Caricamento...</Text>
          ) : bookings.length === 0 ? (
            <Paragraph color="$color10">Nessuna prenotazione confermata ancora.</Paragraph>
          ) : (
            bookings.map((booking) => (
              <YStack key={booking.id} borderWidth={1} borderColor="$borderColor" borderRadius="$4" padding="$3" gap="$2">
                <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                  <Text fontWeight="600">{booking.clientName ?? "Cliente"}</Text>
                  <Text fontSize="$2" color="$blue10" fontWeight="600">
                    {BOOKING_STATUS_LABEL[booking.status]}
                  </Text>
                </YStack>
                <Text color="$color10" fontSize="$3">
                  {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                </Text>
                {booking.laborEurCents !== null ? (
                  <Text color="$color10" fontSize="$3">
                    Manodopera: €{(booking.laborEurCents / 100).toFixed(2)} · Materiali: €
                    {((booking.materialsEurCents ?? 0) / 100).toFixed(2)}
                  </Text>
                ) : null}
                {booking.status === "CONFIRMED" ? (
                  <Button size="$3" alignSelf="flex-start" onPress={() => handleCompleteBooking(booking.id)}>
                    Segna come completato
                  </Button>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </YStack>
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
      <H2 size="$7">Aumenta la tua visibilità</H2>
      {error ? <Text color="$red10">{error}</Text> : null}
      <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
        {BOOST_OPTIONS.map((option) => (
          <YStack key={option.type} flex={1} borderWidth={1} borderColor="$borderColor" borderRadius="$4" padding="$3" gap="$2">
            <Text fontWeight="700">{option.label}</Text>
            <Text color="$color10" fontSize="$3">
              {option.description}
            </Text>
            <Text fontWeight="700">€{option.priceEur.toFixed(2)}</Text>
            <Button
              size="$3"
              alignSelf="flex-start"
              onPress={() => handleBuy(option.type)}
              disabled={loadingType === option.type}
              opacity={loadingType === option.type ? 0.6 : 1}
            >
              {loadingType === option.type ? "Attendi..." : "Acquista"}
            </Button>
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}

function LeadCard({ lead, token }: { lead: ProfessionalLead; token: string }) {
  const [showForm, setShowForm] = useState(false);
  const [labor, setLabor] = useState("");
  const [materials, setMaterials] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(lead.hasQuote);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSendQuote() {
    setError(null);
    const laborEurCents = Math.round(Number(labor.replace(",", ".")) * 100);
    const materialsEurCents = Math.round(Number(materials.replace(",", ".")) * 100);
    if (!Number.isFinite(laborEurCents) || laborEurCents < 0) {
      setError("Inserisci un costo manodopera valido.");
      return;
    }
    if (!Number.isFinite(materialsEurCents) || materialsEurCents < 0) {
      setError("Inserisci un costo materiali valido.");
      return;
    }
    if (!startDate) {
      setError("Indica una data di inizio stimata.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createQuote(token, {
        requestId: lead.guidedRequest.id,
        laborEurCents,
        materialsEurCents,
        estimatedStartDate: new Date(startDate).toISOString(),
        notes: notes.trim() || undefined,
      });
      setSent(true);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" padding="$3" gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" flex={1}>
          <Text fontWeight="700">
            {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.city}
            {lead.guidedRequest.isUrgent ? " · 🔴 Urgente" : ""}
          </Text>
          <Text color="$color10">{lead.guidedRequest.description}</Text>
        </YStack>
        {sent ? (
          <Text fontSize="$2" color="$green10" fontWeight="600">
            Preventivo inviato
          </Text>
        ) : null}
      </YStack>

      {!sent && !showForm ? (
        <Button size="$3" alignSelf="flex-start" onPress={() => setShowForm(true)}>
          Invia preventivo
        </Button>
      ) : null}

      {showForm ? (
        <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor="$borderColor">
          <YStack flexDirection="row" gap="$2" flexWrap="wrap">
            <input
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
              placeholder="Manodopera (€)"
              inputMode="decimal"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14, width: 140 }}
            />
            <input
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              placeholder="Materiali (€)"
              inputMode="decimal"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14, width: 140 }}
            />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
            />
          </YStack>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note per il cliente (opzionale)"
            rows={2}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
          />
          {error ? (
            <Text color="$red10" fontSize="$3">
              {error}
            </Text>
          ) : null}
          <Button size="$3" alignSelf="flex-start" onPress={handleSendQuote} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Invio..." : "Conferma preventivo"}
          </Button>
        </YStack>
      ) : null}
    </YStack>
  );
}
