"use client";

import { Suspense, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerSchema } from "@professionisti/shared";
import { Button, Field, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function RegistratiPage() {
  return (
    <Suspense fallback={null}>
      <RegistratiForm />
    </Suspense>
  );
}

/**
 * Scelta cliente/professionista prima del form vero e proprio — richiesta
 * esplicita dell'utente: cliccando "Registrati" da /accedi (unico punto
 * d'ingresso che arriva qui senza un ruolo già deciso, a differenza dei
 * link "Iscriviti gratis"/"Sei un professionista?" sparsi nel sito che
 * passano già `?ruolo=professionista`) si finiva sempre sulla
 * registrazione cliente, senza poter scegliere. `ruolo=cliente` è un
 * valore nuovo nell'URL (prima l'assenza del parametro significava
 * implicitamente cliente): i link esistenti che passano già
 * `ruolo=professionista` continuano a saltare questa schermata come prima.
 */
function RoleChoiceScreen({
  onChoose,
  noAccountFound,
}: {
  onChoose: (role: "cliente" | "professionista") => void;
  /** Vero se si arriva qui da "Accedi con Google" su un'email senza account (vedi /accedi). */
  noAccountFound?: boolean;
}) {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={480} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia}>
            Registrati
          </Text>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Come vuoi registrarti?
          </Text>
        </YStack>

        {noAccountFound ? (
          <YStack padding="$3" borderRadius="$4" borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo}>
            <Text fontSize="$3" color={brand.urgenza}>
              Nessun account trovato con questa email. Scegli come registrarti per continuare.
            </Text>
          </YStack>
        ) : null}

        <YStack gap="$3">
          <XStack
            alignItems="center"
            gap="$3"
            padding="$4"
            backgroundColor={brand.calce}
            borderWidth={1}
            borderColor={brand.filetto}
            borderRadius="$4"
            cursor="pointer"
            onPress={() => onChoose("cliente")}
            accessibilityRole="button"
          >
            <XStack width={44} height={44} borderRadius="$3" backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
              <Icon name="search" size={20} color={brand.cianografia} strokeWidth={1.5} />
            </XStack>
            <YStack flex={1} gap="$1">
              <Text fontWeight="700" color={brand.grafite}>
                Sono un cliente
              </Text>
              <Text fontSize="$2" color={brand.grafite70}>
                Cerco un professionista per un lavoro.
              </Text>
            </YStack>
            <Icon name="chevron-right" size={18} color={brand.grafite70} />
          </XStack>

          <XStack
            alignItems="center"
            gap="$3"
            padding="$4"
            backgroundColor={brand.calce}
            borderWidth={1}
            borderColor={brand.filetto}
            borderRadius="$4"
            cursor="pointer"
            onPress={() => onChoose("professionista")}
            accessibilityRole="button"
          >
            <XStack width={44} height={44} borderRadius="$3" backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
              <Icon name="hard-hat" size={20} color={brand.cianografia} strokeWidth={1.5} />
            </XStack>
            <YStack flex={1} gap="$1">
              <Text fontWeight="700" color={brand.grafite}>
                Sono un professionista
              </Text>
              <Text fontSize="$2" color={brand.grafite70}>
                Offro i miei servizi e voglio ricevere richieste.
              </Text>
            </YStack>
            <Icon name="chevron-right" size={18} color={brand.grafite70} />
          </XStack>
        </YStack>

        <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
          Hai già un account?{" "}
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </YStack>
    </YStack>
  );
}

/**
 * Casella di spunta compatta per le due dichiarazioni obbligatorie in
 * registrazione — stesso pattern visivo (riquadro 22×22, icona `check`
 * bianca su sfondo cianografia) già in uso in /dashboard/profilo per
 * "Offro anche consulenza online", qui in versione più compatta (un solo
 * rigo di testo, non una card intera) perché servono due insieme.
 */
function ConsentCheckbox({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
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

function RegistratiForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const roleParam = searchParams.get("ruolo");
  const isProfessional = roleParam === "professionista";
  const role = isProfessional ? "PROFESSIONAL" : "CLIENT";

  // Tutti gli hook prima del return condizionale sotto (regola degli hook:
  // stesso numero/ordine di hook ad ogni render).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Richiesta esplicita dell'utente: campo "Conferma password" oltre a
  // nome/email/password, con il proprio toggle mostra/nascondi
  // indipendente dal campo password principale.
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Due dichiarazioni obbligatorie richieste esplicitamente dall'utente
  // ("Verbale di Conformità"): prima nessun atto tracciato confermava che
  // l'utente avesse letto le informative, né esisteva una dichiarazione di
  // maggiore età — vale sia per la registrazione email+password sia per
  // Google (v. `disabled` su GoogleSignInButton sotto).
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const canSubmitConsent = acceptedLegalTerms && declaredAdult;

  function chooseRole(choice: "cliente" | "professionista") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ruolo", choice);
    router.replace(`/registrati?${params.toString()}`);
  }

  if (roleParam !== "professionista" && roleParam !== "cliente") {
    return <RoleChoiceScreen onChoose={chooseRole} noAccountFound={searchParams.get("motivo") === "nessun-account"} />;
  }

  // Con Google Sign-In questa pagina può autenticare anche un account
  // professionista già esistente (es. cliccando "Iscriviti gratis" da
  // /per-professionisti pur avendo già un profilo) — non solo una vera
  // registrazione. `isNewUser` (già restituito da /auth/register e
  // /auth/google/verify) distingue i due casi: solo chi si è appena
  // registrato deve completare il profilo, chi ha già un account va
  // dritto in Dashboard — bug reale segnalato dall'utente, prima si
  // finiva sempre su /dashboard/profilo anche da loggati.
  function afterAuth(isNewUser: boolean) {
    if (!isProfessional) {
      router.push("/");
      return;
    }
    router.push(isNewUser ? "/dashboard/profilo" : "/dashboard");
  }

  async function handleRegister() {
    setError(null);
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }
    const result = registerSchema.safeParse({
      email: email.trim(),
      password,
      role,
      acceptedLegalTerms,
      declaredAdult,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token, isNewUser } = await apiClient.register(
        result.data.email,
        result.data.password,
        result.data.name,
        result.data.role,
        result.data.acceptedLegalTerms,
        result.data.declaredAdult,
      );
      await login(token);
      afterAuth(isNewUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    if (!canSubmitConsent) {
      setError("Accetta Privacy Policy e Termini di Servizio e dichiara di avere almeno 18 anni per continuare.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { token, isNewUser } = await apiClient.verifyGoogle(idToken, role, undefined, acceptedLegalTerms, declaredAdult);
      await login(token);
      afterAuth(isNewUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={420} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia}>
            {isProfessional ? "Professionisti" : "Registrati"}
          </Text>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            {isProfessional ? "Iscriviti come professionista" : "Crea il tuo account"}
          </Text>
          {isProfessional ? (
            <Text color={brand.grafite70}>Gratis per iniziare: completa il profilo e inizia a ricevere richieste.</Text>
          ) : null}
        </YStack>

        <GoogleSignInButton onCredential={handleGoogleCredential} disabled={!canSubmitConsent} />

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <YStack flexDirection="row" alignItems="center" gap="$3">
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              oppure
            </Text>
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
          </YStack>
        ) : null}

        <YStack gap="$4">
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
          />
          <Field
            label="Password"
            hint="Minimo 8 caratteri"
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
            // "new-password" (non "password"/"current-password"): segnala
            // al browser/gestore password del telefono che si sta creando
            // una password nuova, non inserendone una esistente — bug
            // reale segnalato dall'utente, senza questo hint il sistema
            // del telefono chiedeva ripetutamente se salvarla.
            autoComplete="new-password"
            accessibilityLabel="Password"
          />
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

          {/* Due dichiarazioni obbligatorie richieste esplicitamente
              dall'utente ("Verbale di Conformità") — valgono anche per il
              pulsante Google sopra, non solo per questo form. */}
          <YStack gap="$2">
            <ConsentCheckbox checked={acceptedLegalTerms} onToggle={() => setAcceptedLegalTerms((v) => !v)}>
              Ho letto e accetto la{" "}
              <Link href="/privacy" target="_blank" style={{ textDecoration: "underline", color: brand.cianografia }}>
                Privacy Policy
              </Link>{" "}
              e i{" "}
              <Link href="/termini" target="_blank" style={{ textDecoration: "underline", color: brand.cianografia }}>
                Termini di Servizio
              </Link>
              .
            </ConsentCheckbox>
            <ConsentCheckbox checked={declaredAdult} onToggle={() => setDeclaredAdult((v) => !v)}>
              Dichiaro di avere almeno 18 anni.
            </ConsentCheckbox>
          </YStack>

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          <Button
            variant="primary"
            onPress={handleRegister}
            disabled={isSubmitting || !canSubmitConsent}
            opacity={isSubmitting || !canSubmitConsent ? 0.6 : 1}
          >
            {isSubmitting ? "Creazione account..." : "Registrati"}
          </Button>
        </YStack>

        <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
          Hai già un account?{" "}
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </YStack>
    </YStack>
  );
}
