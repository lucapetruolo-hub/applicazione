"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Avatar, Badge, Button, Icon, Rating, Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

// Sotto questa soglia la vetrina non si pubblica: mostrare 3-4 profili reali
// come se fossero "i professionisti in evidenza" darebbe comunque
// l'impressione di una piattaforma vuota — meglio l'onestà del blocco "in
// costruzione" (brief redesign §4.6) finché l'offerta non è concreta.
const MIN_PROFESSIONALS_TO_SHOWCASE = 12;

export function ProfessionalsShowcase({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  if (professionals.length >= MIN_PROFESSIONALS_TO_SHOWCASE) {
    return <RealShowcase professionals={professionals} />;
  }
  return <WaitlistBlock />;
}

function RealShowcase({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  const router = useRouter();
  return (
    <Section eyebrow="Sulla piattaforma" title="Professionisti verificati vicino a te" maxWidth={1200}>
      <XStack width="100%" gap="$3" overflow="scroll" paddingBottom="$2">
        {professionals.slice(0, 10).map((pro) => (
          <YStack
            key={pro.id}
            minWidth={220}
            gap="$2"
            padding="$3"
            borderWidth={1}
            borderColor={brand.filetto}
            borderRadius="$4"
            cursor="pointer"
            onPress={() => router.push(`/professionista/${pro.id}`)}
            accessibilityRole="button"
          >
            <Avatar name={pro.businessName} imageUrl={pro.imageUrl} size={40} />
            <Text fontWeight="600">{pro.businessName}</Text>
            <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.grafite70}>
              {pro.categoryLabel} · {pro.city}
            </Text>
            {pro.rating !== null ? <Rating value={pro.rating} size={13} /> : null}
            {pro.verified ? <Badge variant="verificato">Verificato</Badge> : null}
          </YStack>
        ))}
      </XStack>
    </Section>
  );
}

function WaitlistBlock() {
  const [email, setEmail] = useState("");
  // Honeypot anti-spam (Fase 6): un utente reale non lo vede né lo compila
  // (fuori schermo, non display:none — alcuni bot ignorano i campi nascosti
  // così, non la posizione), un bot che compila ogni campo del form sì.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

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
    <Section eyebrow="In costruzione" maxWidth={640}>
      <YStack alignItems="center" gap="$3">
        <YStack width={56} height={56} borderRadius={28} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
          <Icon name="wrench" size={26} color={brand.cianografia} strokeWidth={1.5} />
        </YStack>
        <Text fontFamily="$heading" fontWeight="700" fontSize="$7" textAlign="center" color={brand.grafite}>
          Stiamo selezionando i primi professionisti
        </Text>
        <Text fontSize="$4" color={brand.grafite70} textAlign="center" maxWidth={480}>
          Lascia la tua email: ti scriviamo appena la tua zona è coperta.
        </Text>

        {status === "done" ? (
          <Text fontWeight="600" color={brand.verificato}>
            Fatto! Ti avviseremo appena partiamo nella tua zona.
          </Text>
        ) : (
          <XStack gap="$2" width="100%" maxWidth={420} flexWrap="wrap" justifyContent="center">
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="La tua email"
              style={{
                flex: 1,
                minWidth: 200,
                padding: "12px 14px",
                borderRadius: 4,
                border: `1px solid ${status === "error" ? brand.urgenza : brand.filetto}`,
                fontSize: 15,
              }}
            />
            <Button variant="primary" onPress={handleSubmit} disabled={status === "loading"} opacity={status === "loading" ? 0.6 : 1}>
              {status === "loading" ? "Invio..." : "Avvisami"}
            </Button>
          </XStack>
        )}
        {status === "error" ? (
          <Text fontSize="$2" color={brand.urgenza}>
            Inserisci un'email valida.
          </Text>
        ) : null}
      </YStack>
    </Section>
  );
}
