"use client";

import { Icon, Text, YStack, brand, type IconName } from "@professionisti/ui";

/** Badge circolare con icona su sfondo a gradiente — in cima ad ogni card
 * di questa pagina, stesso principio "un tocco di profondità in più" già
 * usato per il pannello della campanella notifiche. */
export function AuthIconBadge({ icon }: { icon: IconName }) {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 999,
        background: `linear-gradient(135deg, ${brand.cianografia}, ${brand.cianografiaScuro})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={26} color="white" strokeWidth={1.5} />
    </div>
  );
}

/**
 * Intestazione di ogni passo di registrazione e accesso (docs/CHANGELOG.md
 * §278-§279):
 * "Indietro" in alto a sinistra dove si può tornare, "Passo N di M" con una
 * barra a segmenti, l'icona del passo e il titolo principale (h1). La prima
 * scelta (cliente o professionista) non ha la barra: il numero di passi
 * dipende da quella scelta.
 */
export function AuthStepHeader({
  icon,
  title,
  subtitle,
  step,
  onBack,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  step?: { current: number; total: number };
  onBack?: () => void;
}) {
  return (
    <YStack gap="$4">
      {onBack || step ? (
        <YStack gap="$2">
          <div className="auth-step-top">
            {onBack ? (
              <button type="button" className="auth-back" onClick={onBack}>
                <Icon name="chevron-left" size={20} color={brand.grafite} strokeWidth={1.75} />
                Indietro
              </button>
            ) : null}
            {step ? (
              <span className="auth-step-count">
                Passo {step.current} di {step.total}
              </span>
            ) : null}
          </div>
          {step ? (
            <div className="auth-step-bar" aria-hidden="true">
              {Array.from({ length: step.total }, (_, i) => (
                <span key={i} className={i < step.current ? "is-done" : undefined} />
              ))}
            </div>
          ) : null}
        </YStack>
      ) : null}
      <YStack alignItems="center" gap="$3">
        <AuthIconBadge icon={icon} />
        <YStack alignItems="center" gap="$1">
          <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center" style={{ textWrap: "balance" }}>
            {title}
          </Text>
          {subtitle ? (
            <Text fontSize="$3" color={brand.grafite70} textAlign="center">
              {subtitle}
            </Text>
          ) : null}
        </YStack>
      </YStack>
    </YStack>
  );
}
