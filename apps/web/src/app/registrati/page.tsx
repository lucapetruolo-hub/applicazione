"use client";

import { Suspense, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  NO_CATEGORY_MESSAGE,
  parseSubscriptionTier,
  registerSchema,
  type ProfessionalCategorySlug,
  type ProfessionalEntityTypeValue,
} from "@professionisti/shared";
import { Button, ButtonArrow, Icon, Surface, Text, XStack, YStack, brand, radiusDocLg, type IconName } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GoogleConsentModal } from "@/components/GoogleConsentModal";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { CategoryMultiPicker } from "@/components/CategoryMultiPicker";
import { ClientEmailFirstAuth } from "@/components/ClientEmailFirstAuth";
import { AuthPageBackground } from "@/components/AuthPageBackground";
import { TURNSTILE_PENDING_MESSAGE, TurnstileWidget, isTurnstileEnabled } from "@/components/TurnstileWidget";

export default function RegistratiPage() {
  return (
    <Suspense fallback={null}>
      <RegistratiForm />
    </Suspense>
  );
}

/** Badge circolare con icona su sfondo a gradiente — in cima ad ogni card
 * di questa pagina, stesso principio "un tocco di profondità in più" già
 * usato per il pannello della campanella notifiche. */
function AuthIconBadge({ icon }: { icon: "sparkles" | "search" | "hard-hat" | "briefcase" | "mail" }) {
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
      <Surface className="auth-card-in" width="100%" maxWidth={480} borderRadius={radiusDocLg} padding="$6" gap="$5">
        <YStack alignItems="center" gap="$3">
          <AuthIconBadge icon="sparkles" />
          <YStack alignItems="center" gap="$1">
            <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografiaScuro} textAlign="center">
              Passo 1
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
              <Icon name="search" size={20} color={brand.cianografiaScuro} strokeWidth={1.5} />
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
              <Icon name="hard-hat" size={20} color={brand.cianografiaScuro} strokeWidth={1.5} />
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
            <Text color={brand.cianografiaScuro} fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </Surface>
    </AuthPageBackground>
  );
}

/**
 * Tipo del professionista scelto in registrazione (docs/CHANGELOG.md §243,
 * decisione dell'utente: tre tipi). Nell'URL con parole leggibili, così il
 * tasto "indietro" del telefono torna alla scelta.
 */
const ENTITY_CHOICES: {
  value: ProfessionalEntityTypeValue;
  param: string;
  icon: IconName;
  label: string;
  description: string;
}[] = [
  { value: "PRIVATE_INDIVIDUAL", param: "privato", icon: "user-round", label: "Privato, senza Partita IVA", description: "Lavoro occasionale" },
  { value: "SOLE_PROPRIETOR", param: "partita-iva", icon: "briefcase", label: "Con Partita IVA", description: "Libero professionista o ditta individuale, anche forfettario." },
  { value: "BUSINESS", param: "azienda", icon: "building-2", label: "Azienda", description: "Società con dipendenti o soci: SRL, SNC, SAS, SPA." },
];

function entityChoiceFromParam(param: string | null) {
  return ENTITY_CHOICES.find((choice) => choice.param === param) ?? null;
}

function StepLabel({ children }: { children: ReactNode }) {
  return (
    <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografiaScuro} textAlign="center">
      {children}
    </Text>
  );
}

function EntityTypeScreen({ onChoose, onBack }: { onChoose: (param: string) => void; onBack: () => void }) {
  return (
    <AuthPageBackground>
      <Surface className="auth-card-in" width="100%" maxWidth={480} borderRadius={radiusDocLg} padding="$6" gap="$5">
        <YStack alignItems="center" gap="$3">
          <AuthIconBadge icon="briefcase" />
          <YStack alignItems="center" gap="$1">
            <StepLabel>Passo 2 di 4</StepLabel>
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              Come lavori?
            </Text>
            <Text fontSize="$3" color={brand.grafite70} textAlign="center">
              Così ti chiediamo solo i dati fiscali che servono a te.
            </Text>
          </YStack>
        </YStack>

        <YStack gap="$3" role="list">
          {ENTITY_CHOICES.map((choice) => (
            <XStack
              key={choice.value}
              role="listitem"
              className="auth-role-card"
              alignItems="center"
              gap="$3"
              padding="$4"
              backgroundColor={brand.calce}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$4"
              cursor="pointer"
              onPress={() => onChoose(choice.param)}
              accessibilityRole="button"
            >
              <XStack width={44} height={44} borderRadius="$3" backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center" flexShrink={0}>
                <Icon name={choice.icon} size={20} color={brand.cianografiaScuro} strokeWidth={1.5} />
              </XStack>
              <YStack flex={1} flexBasis={0} minWidth={0} gap="$1">
                <Text fontWeight="700" color={brand.grafite}>
                  {choice.label}
                </Text>
                <Text fontSize="$2" color={brand.grafite70}>
                  {choice.description}
                </Text>
              </YStack>
              <Icon name="chevron-right" size={18} color={brand.grafite70} />
            </XStack>
          ))}
        </YStack>

        <Text fontSize="$2" color={brand.grafite70} textAlign="center">
          Non sai cosa scegliere? Se non hai una Partita IVA scegli &quot;Privato&quot;. Puoi cambiarlo più avanti da Dati fiscali.
        </Text>

        <XStack justifyContent="center">
          <Button variant="ghost" onPress={onBack}>
            Indietro
          </Button>
        </XStack>
      </Surface>
    </AuthPageBackground>
  );
}

/** Riepilogo del tipo scelto in cima al modulo, con "Cambia" per tornare alla scelta. */
function EntityTypeSummary({ choice, onChange }: { choice: (typeof ENTITY_CHOICES)[number]; onChange: () => void }) {
  return (
    <XStack alignItems="center" gap="$3" padding="$3" borderRadius="$4" backgroundColor={brand.cianografiaVelo}>
      <Icon name={choice.icon} size={18} color={brand.cianografiaScuro} strokeWidth={1.75} />
      <YStack flex={1} flexBasis={0} minWidth={0}>
        <Text fontSize={11} fontWeight="700" color={brand.grafite70}>
          Ti iscrivi come
        </Text>
        <Text fontWeight="700" color={brand.grafite}>
          {choice.label}
        </Text>
      </YStack>
      <button type="button" className="link-button" onClick={onChange} aria-label="Cambia il modo in cui lavori">
        Cambia
      </button>
    </XStack>
  );
}

const SIGNUP_BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: "map-pin", title: "Richieste dalla tua zona", text: "Clienti vicino a te che cercano proprio il tuo mestiere." },
  { icon: "calendar", title: "Agenda e promemoria", text: "Appuntamenti in ordine e meno clienti che non si presentano." },
  { icon: "star", title: "Recensioni vere", text: "Solo da lavori confermati: la tua reputazione conta di più." },
];

/**
 * Registrazione del professionista nella stessa scheda della scelta del
 * ruolo (stessa larghezza, stesso sfondo sfocato, docs/CHANGELOG.md §181,
 * richiesta dell'utente): prima era una pagina a due colonne (§173). Foto e
 * vantaggi restano, sotto la scheda. La presentazione completa è in
 * /per-professionisti.
 */
function ProfessionalSignupLayout({
  children,
  step = "Passo 3 di 4",
  icon = "hard-hat",
  title = "Iscriviti come professionista",
  subtitle = "Crea l'account, poi completi il profilo e inizi a ricevere richieste.",
  showFooter = true,
}: {
  children: ReactNode;
  step?: string;
  icon?: "hard-hat" | "mail";
  title?: string;
  subtitle?: string;
  /** Link al cliente, foto e vantaggi: non nella schermata del codice. */
  showFooter?: boolean;
}) {
  return (
    <AuthPageBackground>
      <YStack width="100%" maxWidth={480} gap="$6">
        <Surface className="auth-card-in" width="100%" borderRadius={radiusDocLg} padding="$6" gap="$5">
          <YStack alignItems="center" gap="$3">
            <AuthIconBadge icon={icon} />
            <YStack alignItems="center" gap="$1">
              <StepLabel>{step}</StepLabel>
              <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
                {title}
              </Text>
              {subtitle ? (
                <Text fontSize="$3" color={brand.grafite70} textAlign="center">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
          </YStack>
          {children}
          {showFooter ? (
          <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
            Cerchi un professionista?{" "}
            <Link href="/registrati?ruolo=cliente" style={{ textDecoration: "none" }}>
              <Text color={brand.cianografiaScuro} fontWeight="600">
                Registrati come cliente
              </Text>
            </Link>
          </Text>
          ) : null}
        </Surface>

        {showFooter ? (
        <YStack width="100%" gap="$5">
          <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: radiusDocLg, overflow: "hidden" }}>
            <Image
              src="/page-photos/registrati-elettricista.webp"
              alt="Un elettricista sorride mentre lavora a un quadro elettrico"
              fill
              sizes="(max-width: 520px) 100vw, 480px"
              style={{ objectFit: "cover" }}
            />
          </div>
          <YStack gap="$4">
            {SIGNUP_BENEFITS.map((benefit) => (
              <XStack key={benefit.title} gap="$3" alignItems="flex-start">
                <XStack width={40} height={40} borderRadius={14} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center" flexShrink={0}>
                  <Icon name={benefit.icon} size={19} color={brand.cianografiaScuro} strokeWidth={1.75} />
                </XStack>
                <YStack flex={1} gap="$1">
                  <Text fontWeight="700" color={brand.grafite}>
                    {benefit.title}
                  </Text>
                  <Text fontSize="$3" color={brand.grafite70}>
                    {benefit.text}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </YStack>
          <Link href="/per-professionisti" style={{ textDecoration: "none", alignSelf: "center" }}>
            <Text color={brand.cianografiaScuro} fontWeight="600">
              Scopri come funziona e quanto costa
            </Text>
          </Link>
        </YStack>
        ) : null}
      </YStack>
    </AuthPageBackground>
  );
}

const CLIENT_HEADERS = {
  email: "Continua con l'email",
  new: "Crea il tuo account gratuito",
  password: "Hai già un account",
  google: "Accedi con Google",
} as const;

function ClientSignup({ onAuthenticated }: { onAuthenticated: () => void }) {
  return (
    <AuthPageBackground>
      <Surface className="auth-card-in" width="100%" maxWidth={420} borderRadius={radiusDocLg} padding="$6" gap="$5">
        <ClientEmailFirstAuth
          intro="Richieste, preventivi e professionisti salvati saranno collegati a questa email: li ritrovi nel tuo account e ricevi gli aggiornamenti."
          firstTimeNote="Se è la prima volta, creeremo il tuo account gratuito. Se hai già un account, ti chiediamo la password."
          submitSuffix=""
          onAuthenticated={onAuthenticated}
          renderHeader={(step) => (
            <YStack alignItems="center" gap="$3">
              <AuthIconBadge icon="search" />
              <YStack alignItems="center" gap="$1">
                <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografiaScuro} textAlign="center">
                  Passo 2 di 2
                </Text>
                <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
                  {CLIENT_HEADERS[step]}
                </Text>
              </YStack>
            </YStack>
          )}
        />
        <TrustChips />
        <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
          Offri un servizio?{" "}
          <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografiaScuro} fontWeight="600">
              Iscriviti come professionista
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
function RegistratiForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refreshUser } = useAuth();

  const roleParam = searchParams.get("ruolo");
  const isProfessional = roleParam === "professionista";
  // Livello toccato su /per-professionisti (docs/CHANGELOG.md §177): dopo
  // l'iscrizione si va dritti al pagamento di quel livello.
  const chosenTier = parseSubscriptionTier(searchParams.get("livello"));
  const role = isProfessional ? "PROFESSIONAL" : "CLIENT";
  const entityChoice = entityChoiceFromParam(searchParams.get("tipo"));

  // Tutti gli hook prima del return condizionale sotto (regola degli hook:
  // stesso numero/ordine di hook ad ogni render).
  // Da 1 a 3 categorie (docs/CHANGELOG.md §217): obbligatorie sia con
  // email e password sia con Google, precompilano il profilo.
  const [categorySlugs, setCategorySlugs] = useState<ProfessionalCategorySlug[]>([]);
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  // Due dichiarazioni obbligatorie richieste esplicitamente dall'utente
  // ("Verbale di Conformità"): prima nessun atto tracciato confermava che
  // l'utente avesse letto le informative, né esisteva una dichiarazione di
  // maggiore età — vale sia per la registrazione email+password sia per
  // Google (v. `disabled` su GoogleSignInButton sotto).
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const canSubmitConsent = acceptedLegalTerms && declaredAdult;
  // "Registrati" resta sempre premibile (docs/CHANGELOG.md §248): senza le
  // due spunte le caselle mancanti diventano rosse. Il numero cambia a ogni
  // tentativo per far ripartire la scossa.
  const [consentAttempt, setConsentAttempt] = useState(0);
  // Richiesta esplicita dell'utente: "Continua con Google" deve restare
  // sempre cliccabile fin da subito (prima disabilitato finché non si
  // spuntavano le due caselle qui sotto) — il consenso, quando non ancora
  // dato, viene chiesto in un popup DOPO il login Google, non prima.
  // `pendingGoogleIdToken` valorizzato = popup aperto, in attesa di conferma.
  const [pendingGoogleIdToken, setPendingGoogleIdToken] = useState<string | null>(null);
  const [googleConsentError, setGoogleConsentError] = useState<string | null>(null);
  // Dopo la registrazione con email e password: schermata del codice
  // (docs/CHANGELOG.md §243). Chi entra con Google non la vede mai.
  const [codeStep, setCodeStep] = useState<{ token: string; email: string; resendIn: number; required: boolean } | null>(null);

  function setParam(key: string, value: string | null, mode: "push" | "replace" = "replace") {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    router[mode](`/registrati?${params.toString()}`);
  }

  function chooseRole(choice: "cliente" | "professionista") {
    setParam("ruolo", choice);
  }

  if (roleParam !== "professionista" && roleParam !== "cliente") {
    return <RoleChoiceScreen onChoose={chooseRole} noAccountFound={searchParams.get("motivo") === "nessun-account"} />;
  }

  // Cliente: accesso "prima l'email" (docs/CHANGELOG.md §176), lo stesso del
  // popup della richiesta. Un'email già registrata qui entra con la password.
  if (!isProfessional) {
    return <ClientSignup onAuthenticated={() => router.push("/")} />;
  }

  if (!entityChoice) {
    return <EntityTypeScreen onChoose={(param) => setParam("tipo", param, "push")} onBack={() => setParam("ruolo", null)} />;
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
    // Un professionista che accede di nuovo (non isNewUser) va dritto in
    // Dashboard come già prima.
    if (chosenTier) {
      router.push(`/dashboard/abbonamento?livello=${chosenTier}${isNewUser ? "&nuovo=1" : ""}`);
      return;
    }
    // Il tipo è già scelto (§243): un nuovo account va dritto al profilo.
    router.push(isNewUser ? "/dashboard/profilo" : "/dashboard");
  }

  async function handleRegister() {
    setError(null);
    if (!canSubmitConsent) {
      setConsentAttempt((n) => n + 1);
      const firstMissing = document.getElementById(acceptedLegalTerms ? "consenso-eta" : "consenso-termini");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      firstMissing?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      return;
    }
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
      categorySlugs,
      entityType: entityChoice?.value,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setError(TURNSTILE_PENDING_MESSAGE);
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
        turnstileToken ?? undefined,
        result.data.categorySlugs,
        result.data.entityType,
      );
      const me = await login(token);
      if (isNewUser && me && !me.emailVerified) {
        setCodeStep({ token, email: me.email ?? result.data.email, resendIn: me.emailCodeResendInSeconds ?? 60, required: me.emailVerificationRequired });
        window.scrollTo({ top: 0 });
        return;
      }
      afterAuth(isNewUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      // Il token anti-bot vale una volta sola: ne serve uno nuovo per riprovare.
      setTurnstileReset((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function completeGoogleAuth(idToken: string, accepted: boolean, adult: boolean, viaModal: boolean) {
    setIsSubmitting(true);
    try {
      const { token, isNewUser } = await apiClient.verifyGoogle(idToken, role, undefined, accepted, adult, categorySlugs, entityChoice?.value);
      await login(token);
      afterAuth(isNewUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore imprevisto, riprova.";
      // Il backend rifiuta con questo messaggio esatto SOLO quando sta per
      // creare davvero un account nuovo (nessun account trovato per
      // quell'email) e il consenso non è ancora stato dato
      // (AuthService.verifyGoogleToken: `!existingUser && !legalConsent`)
      // — un account già esistente viene invece riconosciuto ed effettua
      // subito l'accesso, consenso o meno (richiesta esplicita
      // dell'utente: "se c'è un account già presente aprilo e basta").
      // Solo in quel caso si apre il popup, PRIMA di ripetere la chiamata
      // che crea l'account per davvero — mai una creazione senza consenso.
      if (!viaModal && message === "Devi accettare Privacy Policy e Termini di Servizio e dichiarare di avere almeno 18 anni.") {
        setGoogleConsentError(null);
        setPendingGoogleIdToken(idToken);
        return;
      }
      // Nuovo account senza categorie: si chiude il popup e si chiede di
      // sceglierle nel modulo, poi di ripetere l'accesso con Google.
      if (message === NO_CATEGORY_MESSAGE) {
        setPendingGoogleIdToken(null);
        setError(`${NO_CATEGORY_MESSAGE} Poi premi di nuovo il pulsante di Google.`);
        return;
      }
      if (viaModal) {
        setGoogleConsentError(message);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    // Un solo tentativo con lo stato di consenso corrente (le due caselle
    // qui sotto, spuntate o no): il backend riconosce da solo un account
    // già esistente per quell'email (login diretto, nessun consenso
    // richiesto) o segnala che serve il consenso solo se sta per creare
    // l'account per davvero — vedi completeGoogleAuth sopra.
    await completeGoogleAuth(idToken, acceptedLegalTerms, declaredAdult, false);
  }

  async function handleConfirmGoogleConsent() {
    if (!pendingGoogleIdToken) return;
    await completeGoogleAuth(pendingGoogleIdToken, acceptedLegalTerms, declaredAdult, true);
  }

  function handleCancelGoogleConsent() {
    setPendingGoogleIdToken(null);
    setGoogleConsentError(null);
  }

  if (codeStep) {
    return (
      <ProfessionalSignupLayout step="Passo 4 di 4" icon="mail" title="Conferma la tua email" subtitle="" showFooter={false}>
        <EmailCodeForm
          token={codeStep.token}
          email={codeStep.email}
          initialResendSeconds={codeStep.resendIn}
          allowChangeEmail
          onEmailChanged={(next) => {
            setCodeStep((step) => (step ? { ...step, email: next } : step));
            void refreshUser().catch(() => {});
          }}
          onVerified={async () => {
            await refreshUser().catch(() => {});
            afterAuth(true);
          }}
        />
        {/* Finché il dominio d'invio non è verificato su Resend la conferma
            non è obbligatoria (EMAIL_VERIFICATION_REQUIRED): si può andare
            avanti e confermare dopo dalla barra in alto. */}
        {!codeStep.required ? (
          <XStack justifyContent="center">
            <Button variant="ghost" onPress={() => afterAuth(true)}>
              Lo faccio dopo
            </Button>
          </XStack>
        ) : null}
      </ProfessionalSignupLayout>
    );
  }

  // Google, campi, consensi e pulsante del professionista (il cliente usa
  // ClientSignup, sopra).
  const formFields = (
    <>
      <EntityTypeSummary choice={entityChoice} onChange={() => setParam("tipo", null)} />

      <div>
        <span className="auth-field-label" style={{ display: "block", marginBottom: 8 }}>
          Che lavori fai? (fino a 3 scelte)
        </span>
        <CategoryMultiPicker
          value={categorySlugs}
          onChange={(next) => {
            setCategorySlugs(next);
            if (next.length > 0 && error?.startsWith(NO_CATEGORY_MESSAGE)) setError(null);
          }}
        />
      </div>

      <GoogleSignInButton onCredential={handleGoogleCredential} />

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
       *
       * Segnalato di nuovo dall'utente dopo questo fix (specificamente
       * per la registrazione professionista da mobile): investigato più a
       * fondo — DOM stabile e fuoco mai perso durante la digitazione
       * (verificato con Playwright, nessun remount del nodo <input> ad
       * ogni carattere), ma i tre campi risultavano privi di un
       * attributo `id`/`name` (`name=""` su tutti e tre): react-native-web
       * non inoltra affatto `name` al DOM (non è nell'elenco dei prop
       * forwarded di TextInput, verificato nel sorgente del pacchetto —
       * non solo un limite dei tipi TypeScript, come ipotizzato in un
       * giro precedente), ma inoltra `nativeID` come `id` HTML. Due campi
       * "Password"/"Conferma password" altrimenti indistinguibili nel DOM
       * se non per l'ordine sono un caso reale e documentato di euristiche
       * di autofill meno affidabili (alcuni gestori password si affidano
       * anche a `id`/`name`, non solo ad `autocomplete`, per abbinare
       * "nuova password" a "conferma"): `nativeID` aggiunto qui come
       * rinforzo supplementare, a costo zero, allo stesso `autoComplete`
       * già corretto sopra.
       */}
      <form onSubmit={(e) => e.preventDefault()}>
        <YStack gap="$4">
          <AuthField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="username"
            nativeID="email"
            accessibilityLabel="Email"
          />
          <AuthField
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
            nativeID="new-password"
            accessibilityLabel="Password"
          />
          <AuthField
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
            nativeID="new-password-confirm"
            accessibilityLabel="Conferma password"
            onSubmitEditing={handleRegister}
          />

          {/* Due dichiarazioni obbligatorie richieste esplicitamente
              dall'utente ("Verbale di Conformità") — valgono anche per il
              pulsante Google sopra, non solo per questo form. */}
          <YStack key={consentAttempt} gap="$2">
            <ConsentCheckbox
              id="consenso-termini"
              checked={acceptedLegalTerms}
              invalid={consentAttempt > 0}
              onToggle={() => setAcceptedLegalTerms((v) => !v)}
            >
              Ho letto e accetto la{" "}
              <Link href="/privacy" target="_blank" style={{ textDecoration: "underline", color: brand.cianografiaScuro }}>
                Privacy Policy
              </Link>{" "}
              e i{" "}
              <Link href="/termini" target="_blank" style={{ textDecoration: "underline", color: brand.cianografiaScuro }}>
                Termini di Servizio
              </Link>
              .
            </ConsentCheckbox>
            <ConsentCheckbox id="consenso-eta" checked={declaredAdult} invalid={consentAttempt > 0} onToggle={() => setDeclaredAdult((v) => !v)}>
              Dichiaro di avere almeno 18 anni.
            </ConsentCheckbox>
            {consentAttempt > 0 && !canSubmitConsent ? (
              <Text role="alert" fontSize="$2" color={brand.urgenza} fontWeight="600">
                {acceptedLegalTerms || declaredAdult ? "Spunta anche questa casella per continuare." : "Spunta le due caselle per continuare."}
              </Text>
            ) : null}
          </YStack>

          <TurnstileWidget onTokenChange={setTurnstileToken} resetSignal={turnstileReset} />

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          <Button
            variant="primary"
            onPress={handleRegister}
            disabled={isSubmitting}
            opacity={isSubmitting ? 0.6 : 1}
          >
            <XStack alignItems="center" gap="$2">
              <Text color="white" fontFamily="$body" fontWeight="600">
                {isSubmitting ? "Creazione account..." : "Registrati"}
              </Text>
              <ButtonArrow />
            </XStack>
          </Button>
        </YStack>
      </form>

      <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
        Hai già un account?{" "}
        <Link href="/accedi" style={{ textDecoration: "none" }}>
          <Text color={brand.cianografiaScuro} fontWeight="600">
            Accedi
          </Text>
        </Link>
      </Text>
    </>
  );

  return (
    <>
    <ProfessionalSignupLayout>{formFields}</ProfessionalSignupLayout>
    {pendingGoogleIdToken ? (
      <GoogleConsentModal
        acceptedLegalTerms={acceptedLegalTerms}
        declaredAdult={declaredAdult}
        onToggleLegalTerms={() => setAcceptedLegalTerms((v) => !v)}
        onToggleDeclaredAdult={() => setDeclaredAdult((v) => !v)}
        onConfirm={handleConfirmGoogleConsent}
        onCancel={handleCancelGoogleConsent}
        isSubmitting={isSubmitting}
        error={googleConsentError}
      />
    ) : null}
    </>
  );
}
