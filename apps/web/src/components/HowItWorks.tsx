"use client";

import Image from "next/image";
import { Section, Text, YStack, brand } from "@professionisti/ui";

// Foto da Pexels, licenza Pexels (uso commerciale libero, senza obbligo di
// attribuzione): pexels.com/photo/4099322, /12788350, /8292796.
const STEPS: {
  title: string;
  text: string;
  photo: string;
  photoAlt: string;
}[] = [
  {
    title: "Raccontaci il problema",
    text: "Una foto e due righe. Nessun impegno.",
    photo: "/home-photos/come-funziona-1-richiesta.webp",
    photoAlt: "Una donna in cucina scrive una richiesta dal telefono",
  },
  {
    title: "Ricevi preventivi chiari",
    text: "Manodopera, materiali e tempi separati. Confronta prima di dire sì.",
    photo: "/home-photos/come-funziona-2-preventivi.webp",
    photoAlt: "Una coppia sul divano confronta i preventivi al computer",
  },
  {
    title: "Scegli e prenota",
    text: "Conferma in piattaforma. Promemoria via email e SMS prima dell'appuntamento.",
    photo: "/home-photos/come-funziona-3-prenota.webp",
    photoAlt: "Una donna accoglie alla porta di casa il professionista",
  },
];

/**
 * "Come funziona": tre passi, ognuno con una foto di persone al posto della
 * piccola illustrazione di prima (richiesta dell'utente di dare alla home un
 * effetto più umano, docs/CHANGELOG.md §219). Il numero del passo resta come
 * piccolo badge sulla foto: descrive davvero una sequenza.
 */
export function HowItWorks() {
  return (
    <Section
      eyebrow="Come funziona"
      title="Dalla richiesta al lavoro fatto"
      maxWidth={1080}
    >
      {/* Griglia CSS a colonne uguali: con flex={1} le colonne prendevano la
          larghezza del testo e le foto venivano di misure diverse. */}
      <div className="how-steps">
        {STEPS.map((step, index) => (
          <YStack key={step.title} gap="$3" minWidth={0}>
            <div className="how-step-photo">
              <Image
                src={step.photo}
                alt={step.photoAlt}
                fill
                sizes="(max-width: 860px) 100vw, 340px"
                style={{ objectFit: "cover" }}
              />
              <span className="how-step-number" aria-hidden>
                {index + 1}
              </span>
            </div>
            <Text
              fontFamily="$heading"
              fontWeight="600"
              fontSize="$6"
              color={brand.grafite}
            >
              {step.title}
            </Text>
            <Text fontSize="$4" color={brand.grafite70}>
              {step.text}
            </Text>
          </YStack>
        ))}
      </div>
      <Text fontSize="$3" color={brand.grafite70} marginTop="$4">
        Per chi cerca, il servizio è gratuito.
      </Text>
    </Section>
  );
}
