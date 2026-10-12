"use client";

import { useState } from "react";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import {
  Button,
  Icon,
  Section,
  Text,
  XStack,
  YStack,
  brand,
} from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

// Sotto questa soglia l'offerta non è ancora concreta: resta il blocco "in
// costruzione" con l'iscrizione alla lista d'attesa.
const MIN_PROFESSIONALS_TO_SHOWCASE = 12;

/**
 * Finché i professionisti reali sono pochi, la home mostra l'invito a
 * lasciare l'email ("Arriviamo presto nella tua zona"). La vecchia vetrina
 * "Nuovi professionisti vicino a te" che compariva sopra la soglia è stata
 * tolta: ripeteva "Nuovi profili" (`NewProfilesCarousel`), che ora ne ha
 * preso valutazione e badge (richiesta dell'utente, docs/CHANGELOG.md §219).
 */
export function ProfessionalsShowcase({
  professionals,
}: {
  professionals: ProfessionalSearchResult[];
}) {
  if (professionals.length >= MIN_PROFESSIONALS_TO_SHOWCASE) return null;
  return <WaitlistBlock />;
}

function WaitlistBlock() {
  const [email, setEmail] = useState("");
  // Honeypot anti-spam (Fase 6): un utente reale non lo vede né lo compila
  // (fuori schermo, non display:none — alcuni bot ignorano i campi nascosti
  // così, non la posizione), un bot che compila ogni campo del form sì.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );

  async function handleSubmit() {
    if (!email.trim() || !email.includes("@")) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      await apiClient.waitlistSignup(email.trim(), website);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Section eyebrow="Presto disponibile" maxWidth={640}>
      <YStack alignItems="center" gap="$3">
        <YStack
          width={56}
          height={56}
          borderRadius={28}
          backgroundColor={brand.cianografiaVelo}
          alignItems="center"
          justifyContent="center"
        >
          <Icon
            name="bell-ring"
            size={26}
            color={brand.cianografiaScuro}
            strokeWidth={1.5}
          />
        </YStack>
        <Text
          fontFamily="$heading"
          fontWeight="600"
          fontSize="$7"
          textAlign="center"
          color={brand.grafite}
        >
          Arriviamo presto nella tua zona
        </Text>
        <Text
          fontSize="$4"
          color={brand.grafite70}
          textAlign="center"
          maxWidth={480}
        >
          Stiamo selezionando i migliori professionisti del territorio. Lascia
          la tua email: ti avvisiamo non appena il servizio è attivo, con un
          vantaggio per i primi iscritti.
        </Text>

        {status === "done" ? (
          <Text fontWeight="600" color={brand.verificato}>
            Fatto! Ti avviseremo appena partiamo nella tua zona.
          </Text>
        ) : (
          <XStack
            gap="$2"
            width="100%"
            maxWidth={420}
            flexWrap="wrap"
            justifyContent="center"
          >
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{
                position: "absolute",
                left: -9999,
                width: 1,
                height: 1,
                opacity: 0,
              }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="La tua email"
              aria-label="La tua email"
              style={{
                flex: 1,
                minWidth: 200,
                padding: "12px 16px",
                borderRadius: 16,
                border: `1px solid ${status === "error" ? brand.urgenza : brand.filetto}`,
                fontSize: 15,
              }}
            />
            <Button
              variant="primary"
              onPress={handleSubmit}
              disabled={status === "loading"}
              opacity={status === "loading" ? 0.6 : 1}
            >
              {status === "loading" ? "Invio..." : "Avvisami"}
            </Button>
          </XStack>
        )}
        {status === "error" ? (
          <Text fontSize="$2" color={brand.urgenza}>
            Inserisci un'email valida.
          </Text>
        ) : null}
        {status !== "done" ? (
          <Text fontSize="$2" color={brand.grafite70}>
            Niente spam. Solo una notifica quando siamo pronti.
          </Text>
        ) : null}
      </YStack>
    </Section>
  );
}
