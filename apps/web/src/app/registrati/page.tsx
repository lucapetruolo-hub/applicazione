"use client";

import { Suspense, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerSchema } from "@professionisti/shared";
import { Button, Field, Icon, Surface, Text, XStack, YStack, brand, radiusDocLg } from "@professionisti/ui";
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
 * Sfondo condiviso da RoleChoiceScreen/RegistratiForm — richiesta esplicita
 * dell'utente di rendere la pagina "più innovativa" (stesso principio già
 * seguito per NotificationBell, CLAUDE.md §76): due forme sfumate
 * decorative dietro la card del form invece dello sfondo pesca piatto di
 * prima. Le forme vivono in un proprio contenitore assoluto con
 * `overflow:hidden` dedicato (`.auth-page-blobs`, apps/web/globals.css) —
 * mai sull'intera colonna scrollabile, stesso bug già documentato altrove
 * in questo file (§20, "il menu a tendina dell'hero veniva tagliato da un
 * overflow:hidden messo troppo in alto nell'albero") evitato fin dalla
 * prima stesura.
 */
function AuthPageBackground({ children }: { children: ReactNode }) {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4" position="relative">
      <div className="auth-page-blobs" aria-hidden="true">
        <div className="auth-page-blob auth-page-blob--one" />
        <div className="auth-page-blob auth-page-blob--two" />
      </div>
      <YStack width="100%" alignItems="center" position="relative" zIndex={1}>
        {children}
      </YStack>
    </YStack>
  );
}

/** Badge circolare con icona su sfondo a gradiente — in cima ad ogni card
 * di questa pagina, stesso principio "un tocco di profondità in più" già
 * usato per il pannello della campanella notifiche. */
function AuthIconBadge({ icon }: { icon: "sparkles" | "search" | "hard-hat" }) {
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

/** Due chip di fiducia compatte, stesso principio della striscia già in uso
 * nella pagina risultati di ricerca (CLAUDE.md §70, F1.4) — qui in versione
 * ridotta a due voci pertinenti al momento della registrazione. */
function TrustChips() {
  return (
    <XStack flexWrap="wrap" gap="$2" justifyContent="center">
      <XStack alignItems="center" gap="$1" backgroundColor={brand.gesso} borderRadius={999} paddingHorizontal="$3" paddingVertical="$1">
        <Icon name="shield" size={13} color={brand.grafite70} strokeWidth={1.5} />
        <Text fontSize={12} color={brand.grafite70}>
          I tuoi dati sono protetti
        </Text>
      </XStack>
      <XStack alignItems="center" gap="$1" backgroundColor={brand.gesso} borderRadius={999} paddingHorizontal="$3" paddingVertical="$1">
        <Icon name="heart-handshake" size={13} color={brand.grafite70} strokeWidth={1.5} />
        <Text fontSize={12} color={brand.grafite70}>
          Gratis, nessuna carta richiesta
        </Text>
      </XStack>
    </XStack>
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
    <AuthPageBackground>
      <Surface floating className="auth-card-in" width="100%" maxWidth={480} borderRadius={radiusDocLg} padding="$6" gap="$5">
        <YStack alignItems="center" gap="$3">
          <AuthIconBadge icon="sparkles" />
          <YStack alignItems="center" gap="$1">
            <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia} textAlign="center">
              Passo 1 di 2
            </Text>
            <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              Come vuoi registrarti?
            </Text>
          </YStack>
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
            className="auth-role-card"
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
            className="auth-role-card"
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
      </Surface>
    </AuthPageBackground>
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
    <AuthPageBackground>
      <Surface floating className="auth-card-in" width="100%" maxWidth={420} borderRadius={radiusDocLg} padding="$6" gap="$5">
        <YStack alignItems="center" gap="$3">
          <AuthIconBadge icon={isProfessional ? "hard-hat" : "search"} />
          <YStack alignItems="center" gap="$1">
            <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia} textAlign="center">
              Passo 2 di 2
            </Text>
            <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              {isProfessional ? "Iscriviti come professionista" : "Crea il tuo account"}
            </Text>
            {isProfessional ? (
              <Text color={brand.grafite70} textAlign="center">
                Gratis per iniziare: completa il profilo e inizia a ricevere richieste.
              </Text>
            ) : null}
          </YStack>
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

        {/*
         * Bug reale segnalato dall'utente: su iPhone, digitando la password
         * durante la registrazione, il sistema chiedeva "Vuoi salvare la
         * password?" ad OGNI carattere invece che una sola volta all'invio.
         * Due cause concorrenti corrette insieme: (1) il campo Email non
         * aveva alcun `autoComplete`/`name` (a differenza di /accedi, dove
         * era già stato corretto — CLAUDE.md §79/§20), quindi Safari non
         * poteva riconoscere l'intero gruppo come un modulo di creazione
         * account coerente; (2) i campi non erano mai avvolti in un vero
         * elemento HTML <form> — nessuno dei componenti Tamagui qui sotto ne
         * renderizza uno. Senza un <form> reale, l'euristica di Safari per
         * decidere "quando proporre di salvare" non ha un confine di
         * "invio" a cui ancorarsi e può rivalutare la password ad ogni
         * tocco di tasto. Il <form> qui non gestisce l'invio vero (che
         * resta sull'onPress del bottone "Registrati", invariato): serve
         * solo a dare a Safari il confine semantico corretto — onSubmit fa
         * solo preventDefault, per sicurezza nel caso un invio nativo
         * scattasse comunque (es. tasto Invio su un campo).
         */}
        <form onSubmit={(e) => e.preventDefault()}>
          <YStack gap="$4">
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

            <TrustChips />
          </YStack>
        </form>

        <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
          Hai già un account?{" "}
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </Surface>
    </AuthPageBackground>
  );
}
