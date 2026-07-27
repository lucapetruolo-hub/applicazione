"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WEEKDAYS } from "@professionisti/shared";
import { Button, H1, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

type SlotDraft = { dayOfWeek: number; start: string; end: string };

export default function DashboardAgendaPage() {
  const { user, token, isLoading } = useAuth();

  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [bookableAgenda, setBookableAgenda] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMyAvailability(token)
      .then((existing) => {
        // Stessa cautela della pagina profilo pubblico: non fidarsi
        // ciecamente della forma della risposta se l'API non è ancora
        // allineata all'ultimo deploy del frontend.
        if (!Array.isArray(existing?.slots)) return;
        setSlots(existing.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, start: s.startTime, end: s.endTime })));
        setBookableAgenda(Boolean(existing.bookableAgenda));
      })
      .catch((err) => {
        // Bug reale segnalato dall'utente: senza questo controllo, un
        // professionista che apre "Agenda" (nuova voce di menu) prima di
        // aver salvato il profilo base in /dashboard/profilo poteva
        // compilare e "salvare" l'agenda normalmente, ma il salvataggio
        // falliva silenziosamente con un piccolo testo d'errore facile da
        // non notare ("Completa prima il tuo profilo professionista") —
        // sembrava che l'agenda non si salvasse. Stesso pattern già usato
        // in /dashboard per lo stesso identico caso.
        if (err instanceof Error && err.message.includes("profilo")) {
          setProfileMissing(true);
        }
      })
      .finally(() => setIsLoadingSlots(false));
  }, [token]);

  if (isLoading || (token && isLoadingSlots)) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi come professionista
          </H1>
          <Link href="/accedi?redirect=/dashboard/agenda" style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "PROFESSIONAL") {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <H1 size="$7" textAlign="center">
            Questa sezione è per i professionisti
          </H1>
        </YStack>
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
            Serve un profilo completo (nome attività, categoria, città) prima di poter impostare l&apos;agenda.
          </Paragraph>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button size="$5">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  function addSlot(dayOfWeek: number) {
    setSlots((prev) => [...prev, { dayOfWeek, start: "09:00", end: "13:00" }]);
  }

  function updateSlot(index: number, field: "start" | "end", value: string) {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)));
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    for (const slot of slots) {
      if (slot.end <= slot.start) {
        setError("L'orario di fine deve essere dopo l'orario di inizio in ogni fascia.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiClient.upsertMyAvailability(
        token as string,
        slots.map((slot) => ({ dayOfWeek: slot.dayOfWeek, startTime: slot.start, endTime: slot.end })),
        bookableAgenda,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.message.includes("profilo")) {
        setProfileMissing(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={640} gap="$5">
        <YStack gap="$1">
          <H1 size="$8">Agenda</H1>
          <Paragraph color="$color10">
            Indica in quali giorni della settimana e fasce orarie sei disponibile: i clienti la vedranno sul tuo
            profilo pubblico, con le fasce già prenotate barrate.
          </Paragraph>
        </YStack>

        <YStack
          flexDirection="row"
          alignItems="center"
          gap="$3"
          padding="$3"
          backgroundColor="$color2"
          borderRadius="$4"
          cursor="pointer"
          onPress={() => setBookableAgenda((v) => !v)}
        >
          <YStack
            width={22}
            height={22}
            borderRadius="$2"
            borderWidth={2}
            borderColor={bookableAgenda ? "$blue10" : "$borderColor"}
            backgroundColor={bookableAgenda ? "$blue10" : "white"}
            alignItems="center"
            justifyContent="center"
          >
            {bookableAgenda ? (
              <Text fontSize="$3" color="white" fontWeight="700">
                ✓
              </Text>
            ) : null}
          </YStack>
          <YStack flex={1}>
            <Text fontWeight="600">📅 Permetti ai clienti di prenotare direttamente da questi orari</Text>
            <Text fontSize="$2" color="$color10">
              Se disattivo, l&apos;agenda resta visibile ma solo come orari generali di disponibilità: il cliente ti
              contatta comunque tramite richiesta di preventivo.
            </Text>
          </YStack>
        </YStack>

        <YStack gap="$4">
          {WEEKDAYS.map((day) => {
            const daySlots = slots
              .map((slot, index) => ({ slot, index }))
              .filter(({ slot }) => slot.dayOfWeek === day.value);
            return (
              <YStack key={day.value} gap="$2">
                <Text fontWeight="600">{day.label}</Text>
                {daySlots.length === 0 ? (
                  <Text fontSize="$2" color="$color9">
                    Nessun orario impostato.
                  </Text>
                ) : (
                  <YStack gap="$2">
                    {daySlots.map(({ slot, index }) => (
                      <YStack key={index} flexDirection="row" gap="$2" alignItems="center">
                        <input
                          type="time"
                          value={slot.start}
                          onChange={(e) => updateSlot(index, "start", e.target.value)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
                        />
                        <Text fontSize="$2" color="$color9">
                          –
                        </Text>
                        <input
                          type="time"
                          value={slot.end}
                          onChange={(e) => updateSlot(index, "end", e.target.value)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
                        />
                        <Button size="$2" backgroundColor="$color3" color="$color12" onPress={() => removeSlot(index)}>
                          ✕
                        </Button>
                      </YStack>
                    ))}
                  </YStack>
                )}
                <Button
                  size="$2"
                  alignSelf="flex-start"
                  backgroundColor="$color3"
                  color="$color12"
                  onPress={() => addSlot(day.value)}
                >
                  + Aggiungi orario
                </Button>
              </YStack>
            );
          })}
        </YStack>

        {error ? (
          <Text color="$red10" fontSize="$3">
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text color="$green10" fontSize="$3">
            Agenda salvata!
          </Text>
        ) : null}

        <Button size="$5" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
          {isSubmitting ? "Salvataggio..." : "Salva agenda"}
        </Button>
      </YStack>
    </YStack>
  );
}
