"use client";

import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ClientEmailFirstAuth } from "@/components/ClientEmailFirstAuth";

const HEADERS = {
  email: { eyebrow: "Un ultimo passo", title: "Continua con l'email" },
  new: { eyebrow: "Email nuova", title: "Crea il tuo account gratuito" },
  password: { eyebrow: "Hai già un account", title: "Inserisci la password" },
  google: { eyebrow: "Hai già un account", title: "Accedi con Google" },
} as const;

/**
 * Gate di autenticazione mostrato SOLO al momento dell'invio di
 * "Richiedi un preventivo"/"Richiesta urgente" (richiesta esplicita
 * dell'utente, "Verbale Cognitivo" F2.2: prima l'intero modulo era
 * sostituito da questo stesso invito fin dal primo render, bloccando la
 * compilazione — proprio nel flusso a più alta intenzione, es. un'urgenza
 * reale). A differenza del vecchio gate (link verso /accedi/`/registrati,
 * con conseguente navigazione fuori pagina e perdita di quanto già
 * digitato/delle foto selezionate), login e registrazione avvengono qui
 * senza mai lasciare la pagina: nessuno stato del modulo va perso.
 * Stesso pattern overlay già in uso altrove nel prodotto (`role="dialog"`,
 * chiusura al click sul backdrop) — chiudibile per tornare a modificare
 * il modulo, non un vicolo cieco.
 *
 * Dentro, l'accesso "prima l'email" dei clienti (ClientEmailFirstAuth,
 * docs/CHANGELOG.md §176).
 */
export function InlineAuthGate({ onAuthenticated, onClose }: { onAuthenticated: () => void; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accedi o crea un account per inviare la richiesta"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(43,32,19,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        zIndex: 300,
        overflowY: "auto",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440 }}>
        <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5">
          <ClientEmailFirstAuth
            intro="Richieste e preventivi saranno collegati a questa email: li ritrovi nel tuo account e ricevi gli aggiornamenti. Quello che hai scritto resta com'è."
            firstTimeNote="Se è la tua prima richiesta, creeremo il tuo account gratuito per seguire preventivi, messaggi e lavori."
            submitSuffix=" e invia la richiesta"
            onAuthenticated={() => onAuthenticated()}
            renderHeader={(step) => (
              <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
                <YStack gap="$1" flex={1}>
                  <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografiaScuro}>
                    {HEADERS[step].eyebrow}
                  </Text>
                  <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                    {HEADERS[step].title}
                  </Text>
                </YStack>
                <Text cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
                  <Icon name="x" size={20} color={brand.grafite70} />
                </Text>
              </XStack>
            )}
          />
        </YStack>
      </div>
    </div>
  );
}
