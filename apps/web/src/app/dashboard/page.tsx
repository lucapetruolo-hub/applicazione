"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { ProfessionalBooking, ProfessionalLead } from "@professionisti/shared";
import { Badge, Button, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";

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
            leads.map((lead) => <LeadCard key={lead.id} lead={lead} token={token} />)
          )}
        </YStack>

        <BoostSection token={token} />

        <YStack gap="$3">
          <SectionTitle>Agenda</SectionTitle>
          {bookings === null ? (
            <LoadingState />
          ) : (
            <Surface flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
              <YStack gap="$1">
                <Text fontWeight="600" color={brand.grafite}>
                  {upcomingBookingsCount(bookings) === 0
                    ? "Nessuna prenotazione in arrivo."
                    : `${upcomingBookingsCount(bookings)} prenotazion${upcomingBookingsCount(bookings) === 1 ? "e" : "i"} in arrivo.`}
                </Text>
                <Text fontSize="$2" color={brand.grafite70}>
                  Calendario disponibilità e prenotazioni, con i dettagli di ogni appuntamento.
                </Text>
              </YStack>
              <Link href="/dashboard/agenda" style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="$3" height={40}>
                  Apri il calendario
                </Button>
              </Link>
            </Surface>
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}

function upcomingBookingsCount(bookings: ProfessionalBooking[]): number {
  const now = Date.now();
  return bookings.filter((b) => (b.status === "PENDING" || b.status === "CONFIRMED") && new Date(b.scheduledAt).getTime() >= now).length;
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

function LeadCard({ lead, token }: { lead: ProfessionalLead; token: string }) {
  const [showForm, setShowForm] = useState(false);
  // Una voce di default ("Manodopera") già pronta, il professionista può
  // rinominarla/rimuoverla e aggiungerne altre (es. "Materiali", "Trasporto")
  // — ogni voce ha il proprio range di prezzo, non più due campi fissi
  // manodopera/materiali — richiesta esplicita dell'utente.
  const [items, setItems] = useState<QuoteItemDraft[]>([{ name: "Manodopera", priceMin: "", priceMax: "" }]);
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(lead.hasQuote);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (!startDate) {
      setError("Indica una data di inizio stimata.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createQuote(token, {
        requestId: lead.guidedRequest.id,
        items: parsedItems,
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
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" flex={1}>
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontWeight="700" color={brand.grafite}>
              {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.city}
            </Text>
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
          </XStack>
          <Text color={brand.grafite70}>{lead.guidedRequest.description}</Text>
        </YStack>
        {sent ? (
          <Text fontSize="$2" color={brand.verificato} fontWeight="600">
            Preventivo inviato
          </Text>
        ) : null}
      </YStack>

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
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...smallInputStyle, alignSelf: "flex-start" }} />
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
    </Surface>
  );
}
