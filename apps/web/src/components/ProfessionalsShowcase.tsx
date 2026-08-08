"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Avatar, Badge, Button, Icon, Rating, Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CategoryCarousel } from "@/components/CategoryCarousel";

// Sotto questa soglia la vetrina non si pubblica: mostrare 3-4 profili reali
// come se fossero "i professionisti in evidenza" darebbe comunque
// l'impressione di una piattaforma vuota — meglio l'onestà del blocco "in
// costruzione" finché l'offerta non è concreta.
const MIN_PROFESSIONALS_TO_SHOWCASE = 12;

// Un profilo creato negli ultimi 30 giorni riceve il badge "Nuovo" nella
// vetrina — richiesta esplicita dell'utente ("carosello con nuovi profili
// simile a quello presente su miodottore").
const NEW_PROFILE_WINDOW_DAYS = 30;

// TEMPORANEO — richiesta esplicita dell'utente, da rimuovere prima del
// lancio ufficiale ("foto stock di persone, che verranno eliminate prima
// del lancio ufficiale"): solo qui, nel carosello vetrina della home, un
// professionista senza `imageUrl` mostra una foto stock invece delle
// iniziali. Deliberatamente NON in `Avatar.tsx` (che resta "foto vera o
// iniziali, mai altro", invariato ovunque nel resto del sito — ricerca,
// profilo pubblico, dashboard) e deliberatamente scoped al solo carosello,
// per decisione esplicita dell'utente durante questo giro di lavoro.
// randomuser.me: servizio pubblico pensato apposta per foto placeholder di
// persone in demo/prototipi (non hotlink di contenuto arbitrario non
// verificato). Assegnazione deterministica per id professionista (hash
// stabile), così lo stesso profilo mostra sempre la stessa foto invece di
// "mischiarsi" ad ogni reload.
const FAKE_SHOWCASE_PHOTOS = [
  "https://randomuser.me/api/portraits/men/32.jpg",
  "https://randomuser.me/api/portraits/women/44.jpg",
  "https://randomuser.me/api/portraits/men/65.jpg",
  "https://randomuser.me/api/portraits/women/68.jpg",
  "https://randomuser.me/api/portraits/men/12.jpg",
  "https://randomuser.me/api/portraits/women/21.jpg",
  "https://randomuser.me/api/portraits/men/77.jpg",
  "https://randomuser.me/api/portraits/women/57.jpg",
  "https://randomuser.me/api/portraits/men/45.jpg",
  "https://randomuser.me/api/portraits/women/33.jpg",
];

function fakeShowcasePhoto(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return FAKE_SHOWCASE_PHOTOS[hash % FAKE_SHOWCASE_PHOTOS.length]!;
}

export function ProfessionalsShowcase({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  if (professionals.length >= MIN_PROFESSIONALS_TO_SHOWCASE) {
    return <RealShowcase professionals={professionals} />;
  }
  return <WaitlistBlock />;
}

function isNewProfile(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs < NEW_PROFILE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function RealShowcase({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  const router = useRouter();
  // Copia ordinata per data di creazione (più recenti prima), solo per
  // questa vetrina — non tocca l'ordinamento di /cerca (boost→rating→
  // recensioni, leva di monetizzazione, invariato altrove).
  const sorted = [...professionals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Section eyebrow="Sulla piattaforma" title="Nuovi professionisti vicino a te" maxWidth={1200}>
      <CategoryCarousel>
        {sorted.slice(0, 10).map((pro) => (
          <div key={pro.id} style={{ flexShrink: 0 }}>
            <YStack
              width={240}
              gap="$2"
              padding="$4"
              backgroundColor={brand.calce}
              borderRadius={24}
              cursor="pointer"
              onPress={() => router.push(`/professionista/${pro.id}`)}
              accessibilityRole="button"
              style={{ boxShadow: "none" }}
            >
              <XStack justifyContent="space-between" alignItems="flex-start">
                <Avatar name={pro.businessName} imageUrl={pro.imageUrl ?? fakeShowcasePhoto(pro.id)} size={64} />
                {isNewProfile(pro.createdAt) ? <Badge variant="nuovo">Nuovo</Badge> : null}
              </XStack>
              <Text fontWeight="700" fontSize={16} color={brand.grafite}>
                {pro.businessName}
              </Text>
              <Text fontSize={13} color={brand.grafite70}>
                {pro.categoryLabel} · {pro.city}
              </Text>
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                {pro.rating !== null ? <Rating value={pro.rating} size={13} /> : null}
                {pro.verified ? <Badge variant="verificato">Verificato</Badge> : null}
              </XStack>
            </YStack>
          </div>
        ))}
      </CategoryCarousel>
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
    <Section eyebrow="Presto disponibile" maxWidth={640}>
      <YStack alignItems="center" gap="$3">
        <YStack width={56} height={56} borderRadius={28} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
          <Icon name="bell-ring" size={26} color={brand.cianografia} strokeWidth={1.5} />
        </YStack>
        <Text fontFamily="$heading" fontWeight="600" fontSize="$7" textAlign="center" color={brand.grafite}>
          Arriviamo presto nella tua zona
        </Text>
        <Text fontSize="$4" color={brand.grafite70} textAlign="center" maxWidth={480}>
          Stiamo selezionando i migliori professionisti del territorio. Lascia la tua email: ti avvisiamo non appena
          il servizio è attivo, con un vantaggio per i primi iscritti.
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
                padding: "12px 16px",
                borderRadius: 16,
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
        {status !== "done" ? (
          <Text fontSize="$2" color={brand.grafite70}>
            Niente spam. Solo una notifica quando siamo pronti.
          </Text>
        ) : null}
      </YStack>
    </Section>
  );
}
