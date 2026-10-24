"use client";

import { Icon, Text, YStack, brand, type IconName } from "@professionisti/ui";

type BoostOption = {
  type: "BOOST_LOCALE" | "STORIA_SUCCESSO";
  label: string;
  description: string;
  perks: string[];
  priceEur: number;
  priceNote: string;
  icon: IconName;
  tone: "green" | "gold";
};

const BOOST_OPTIONS: BoostOption[] = [
  {
    type: "BOOST_LOCALE",
    label: "Boost locale",
    description: "Compari tra i primi quando cercano la tua categoria nella tua zona.",
    perks: ["Prime posizioni per 30 giorni", "Etichetta Sponsorizzato"],
    priceEur: 19.9,
    priceNote: "30 giorni",
    icon: "trending-up",
    tone: "green",
  },
  {
    type: "STORIA_SUCCESSO",
    label: "Storia di successo",
    description: "Raccontiamo un tuo lavoro riuscito, in evidenza sul sito.",
    perks: ["Testo curato da noi", "Con le foto del lavoro"],
    priceEur: 49.9,
    priceNote: "una tantum",
    icon: "sparkles",
    tone: "gold",
  },
];

/**
 * Pacchetti di visibilità (CLAUDE.md §6), in fondo alla Home "Oggi"
 * (docs/CHANGELOG.md §252, decisione dell'utente: tolti da "Profilo e
 * visibilità", restano solo Boost locale e Storia di successo). Gli acquisti
 * non sono ancora attivi: niente pulsante "Acquista" che fallirebbe sempre,
 * solo lo stato "In arrivo". Prezzi invariati.
 */
export function BoostSection() {
  return (
    <YStack gap="$3">
      <YStack>
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Aumenta la tua visibilità
        </Text>
        <Text fontSize={13} color={brand.grafite70}>
          Ti avvisiamo appena si potranno attivare.
        </Text>
      </YStack>
      <div className="boost-grid">
        {BOOST_OPTIONS.map((option) => (
          <article key={option.type} className={`boost-card is-${option.tone}`}>
            <span className="boost-card-glow" aria-hidden="true">
              <Icon name={option.icon} size={120} strokeWidth={1.25} color={option.tone === "green" ? brand.cianografia : brand.ottone} />
            </span>
            <div className="boost-card-top">
              <span className="boost-card-icon">
                <Icon name={option.icon} size={22} strokeWidth={2} color="#FFFFFF" />
              </span>
              <span className="boost-card-soon">In arrivo</span>
            </div>
            <div className="boost-card-body">
              <h3>{option.label}</h3>
              <p>{option.description}</p>
              <ul>
                {option.perks.map((perk) => (
                  <li key={perk}>
                    <Icon name="check" size={15} strokeWidth={2.5} color={option.tone === "green" ? brand.cianografiaScuro : brand.ottoneScuro} />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
            <div className="boost-card-price">
              <strong>{option.priceEur.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</strong>
              <span>{option.priceNote}</span>
            </div>
          </article>
        ))}
      </div>
    </YStack>
  );
}
