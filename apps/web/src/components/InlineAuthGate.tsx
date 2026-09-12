"use client";

import { useState } from "react";
import { emailPasswordSchema, registerSchema } from "@professionisti/shared";
import { Button, Field, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

/**
 * Casella di spunta compatta per le due dichiarazioni obbligatorie in
 * registrazione — stessa resa già in uso in /registrati (duplicata qui:
 * non esportata da quel file, componente piccolo, non vale introdurre una
 * dipendenza tra le due pagine solo per questo).
 */
function ConsentCheckbox({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: string }) {
  return (
    <XStack alignItems="flex-start" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <YStack
        width={18}
        height={18}
        marginTop={2}
        borderRadius="$1"
        borderWidth={2}
        borderColor={checked ? brand.cianografia : brand.filetto}
        backgroundColor={checked ? brand.cianografia : brand.calce}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {checked ? <Icon name="check" size={12} strokeWidth={2.5} color="white" /> : null}
      </YStack>
      <Text fontSize="$2" color={brand.grafite70} lineHeight={18}>
        {children}
      </Text>
    </XStack>
  );
}

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
 */
export function InlineAuthGate({ onAuthenticated, onClose }: { onAuthenticated: () => void; onClose: () => void }) {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);
    const result = emailPasswordSchema.safeParse({ email: email.trim(), password });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { token } = await apiClient.login(result.data.email, result.data.password);
      await login(token);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister() {
    setError(null);
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }
    // Ruolo sempre CLIENT: questo gate compare solo nel flusso "richiedi un
    // preventivo", inequivocabilmente un cliente — un professionista ha già
    // un account e userebbe "Accedi", non questo form di registrazione.
    const result = registerSchema.safeParse({
      email: email.trim(),
      password,
      role: "CLIENT",
      acceptedLegalTerms,
      declaredAdult,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { token } = await apiClient.register(
        result.data.email,
        result.data.password,
        result.data.name,
        result.data.role,
        result.data.acceptedLegalTerms,
        result.data.declaredAdult,
      );
      await login(token);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    if (mode === "register" && !(acceptedLegalTerms && declaredAdult)) {
      setError("Accetta Privacy Policy e Termini di Servizio e dichiara di avere almeno 18 anni per continuare.");
      return;
    }
    setIsSubmitting(true);
    try {
      // In modalità "Accedi", createIfMissing=false (stesso principio già in
      // uso su /accedi): non deve iscrivere silenziosamente un account nuovo
      // su un'email mai registrata. Se capita, si passa a "Registrati" con
      // lo stesso Google Sign-In, invece di rimandare a una pagina diversa.
      const { token } = await apiClient.verifyGoogle(
        idToken,
        "CLIENT",
        mode === "register",
        mode === "register" ? acceptedLegalTerms : undefined,
        mode === "register" ? declaredAdult : undefined,
      );
      await login(token);
      onAuthenticated();
    } catch (err) {
      if (mode === "login" && err instanceof Error && err.message === "Nessun account trovato con questa email.") {
        setMode("register");
        setError("Nessun account trovato con questa email: crea un account gratuito per continuare.");
        return;
      }
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmitRegister = mode === "login" || (acceptedLegalTerms && declaredAdult);

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
        <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5" gap="$4">
          <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
            <YStack gap="$1" flex={1}>
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia}>
                Un ultimo passo
              </Text>
              <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                {mode === "login" ? "Accedi per inviare la richiesta" : "Crea l'account gratuito"}
              </Text>
            </YStack>
            <Text cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
              <Icon name="x" size={20} color={brand.grafite70} />
            </Text>
          </XStack>

          <Text fontSize="$3" color={brand.grafite70}>
            Quello che hai già scritto resta com'è: dopo l&apos;accesso la richiesta parte subito, senza ricominciare da capo.
          </Text>

          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={!canSubmitRegister} />

          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            <XStack alignItems="center" gap="$3">
              <YStack flex={1} height={1} backgroundColor={brand.filetto} />
              <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
                oppure
              </Text>
              <YStack flex={1} height={1} backgroundColor={brand.filetto} />
            </XStack>
          ) : null}

          {/* Stesso bug/fix già documentato in /registrati (CLAUDE.md): un
              <form> reale dà a Safari/iOS il confine semantico necessario
              per non rivalutare "vuoi salvare la password?" ad ogni
              carattere — onSubmit fa solo preventDefault, l'invio vero
              resta sull'onPress del bottone qui sotto, invariato. */}
          <form onSubmit={(e) => e.preventDefault()}>
            <YStack gap="$3">
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="nome@esempio.it"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="username"
                accessibilityLabel="Email"
              />
              <Field
                label="Password"
                rightElement={
                  <Text
                    cursor="pointer"
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Nascondi password" : "Mostra password"}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size={18} strokeWidth={1.5} color={brand.grafite70} />
                  </Text>
                }
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry={!showPassword}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                accessibilityLabel="Password"
                onSubmitEditing={mode === "login" ? handleLogin : undefined}
              />
              {mode === "register" ? (
                <Field
                  label="Conferma password"
                  rightElement={
                    <Text
                      cursor="pointer"
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={showConfirmPassword ? "Nascondi password" : "Mostra password"}
                    >
                      <Icon name={showConfirmPassword ? "eye-off" : "eye"} size={18} strokeWidth={1.5} color={brand.grafite70} />
                    </Text>
                  }
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Ripeti la password"
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="new-password"
                  accessibilityLabel="Conferma password"
                  onSubmitEditing={handleRegister}
                />
              ) : null}

              {mode === "register" ? (
                <YStack gap="$2">
                  <ConsentCheckbox checked={acceptedLegalTerms} onToggle={() => setAcceptedLegalTerms((v) => !v)}>
                    Accetto Privacy Policy e Termini di Servizio.
                  </ConsentCheckbox>
                  <ConsentCheckbox checked={declaredAdult} onToggle={() => setDeclaredAdult((v) => !v)}>
                    Dichiaro di avere almeno 18 anni.
                  </ConsentCheckbox>
                </YStack>
              ) : null}

              {error ? (
                <Text color={brand.urgenza} fontSize="$3">
                  {error}
                </Text>
              ) : null}

              <Button
                variant="primary"
                onPress={mode === "login" ? handleLogin : handleRegister}
                disabled={isSubmitting || !canSubmitRegister}
                opacity={isSubmitting || !canSubmitRegister ? 0.6 : 1}
              >
                {isSubmitting ? "Un momento..." : mode === "login" ? "Accedi e invia la richiesta" : "Crea account e invia la richiesta"}
              </Button>

              <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
                {mode === "login" ? "Non hai ancora un account? " : "Hai già un account? "}
                <Text
                  color={brand.cianografia}
                  fontWeight="600"
                  cursor="pointer"
                  onPress={() => {
                    setError(null);
                    setMode((m) => (m === "login" ? "register" : "login"));
                  }}
                >
                  {mode === "login" ? "Registrati" : "Accedi"}
                </Text>
              </Text>
            </YStack>
          </form>
        </YStack>
      </div>
    </div>
  );
}
