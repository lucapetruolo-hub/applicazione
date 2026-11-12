"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "@/components/IntentLink";
import { usePathname } from "next/navigation";
import { Button } from "@professionisti/ui";
import { LogoPlain } from "./LogoPlain";
import styles from "./SiteHeader.module.css";
import { TOKEN_STORAGE_KEY, useAuth } from "@/lib/AuthContext";
import { prefetchCategoryOrder } from "@/lib/categoryOrder";
import { MegaMenu } from "./MegaMenu";
import { BRAND } from "@professionisti/shared";

// Caricata a parte (docs/CHANGELOG.md §345): serve solo nelle pagine dei
// risultati e porta con sé l'elenco di tutti i comuni (circa 440 KB), che
// prima finiva nel JavaScript di ogni pagina del sito.
const HeaderSearchBar = dynamic(() => import("./HeaderSearchBar").then((module) => module.HeaderSearchBar));

// Campanella e menu dell'account: servono solo a chi ha fatto l'accesso, ma
// con i testi di tutte le notifiche e il percorso di attivazione del
// professionista pesavano su ogni pagina anche per chi visita senza account
// (docs/changelog/2026-11-09-meno-javascript-comune.md). Caricati a parte;
// il posto è tenuto con le stesse misure, così l'intestazione non salta.
const loadNotificationBell = () => import("./NotificationBell").then((module) => module.NotificationBell);
const loadAccountMenu = () => import("./AccountMenu").then((module) => module.AccountMenu);
const NotificationBell = dynamic(loadNotificationBell, { ssr: false, loading: () => <span className="hdr-slot-bell" aria-hidden="true" /> });
const AccountMenu = dynamic(loadAccountMenu, { ssr: false, loading: () => <span className="hdr-slot-account" aria-hidden="true" /> });

/**
 * Header sticky (brief "Vicinato", CLAUDE.md §19): niente più hairline —
 * un'ombra morbida compare solo dopo 8px di scroll, coerente con il resto
 * del sito che segnala la profondità con `shadowVicinato` invece di un
 * bordo netto.
 *
 * `MegaMenu` è un'unica istanza, mai duplicata: mostra da sola il trigger
 * "Servizi" desktop o l'hamburger mobile a seconda della larghezza,
 * tramite il proprio CSS interno (media query a 860px) — annidarla in un
 * wrapper Tamagui `$gtMd`-only nasconderebbe anche il suo trigger mobile.
 */
/** Barre ferme sotto l'intestazione: con queste la barra non si accorcia (vedi sotto). */
const STICKY_BELOW_HEADER = ".acct-nav, .admin-nav, .profile-index, .ag-days, .results-map-sticky";

const AUTH_PAGES = ["/registrati", "/accedi", "/password-dimenticata", "/reimposta-password", "/conferma-email", "/completa-profilo"];

export function SiteHeader() {
  const { user, isLoading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  // Richiesta esplicita dell'utente: "una volta effettuata la ricerca
  // sposta le due stringhe di ricerca 'cosa cerchi' e 'città' con il
  // tasto 'cerca' sopra sulla barra fissa in alto, nascondendo i tasti
  // 'servizi' 'come funziona' 'prezzi'" — scoped a `/cerca`/`/cerca/[categoria]`,
  // le uniche due pagine con un banner di ricerca proprio nel corpo.
  const isSearchResultsPage = pathname === "/cerca" || pathname.startsWith("/cerca/");
  // Registrazione e accesso (docs/CHANGELOG.md §279): niente "Richiedi
  // preventivo" in alto, l'attenzione resta sul modulo.
  const isAuthPage = AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
  // In home è tornato (richiesta di Luca, docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md,
  // dopo il §349): resta a portata di mano anche scorrendo. Non compare solo
  // dentro una richiesta: su /preventivo porterebbe alla pagina già aperta, su
  // /urgente a una richiesta diversa da quella che si sta compilando.
  const isQuotePage = pathname === "/preventivo" || pathname === "/urgente";
  // Pagine per chi offre un servizio: a chi non ha un account il pulsante in
  // alto propone l'iscrizione, non la richiesta di preventivo da cliente
  // (richiesta di Luca, docs/changelog/2026-11-12-pagina-per-professionisti.md).
  const isProPage = pathname === "/per-professionisti" || pathname.startsWith("/per-professionisti/") || pathname.startsWith("/lavora-con-noi/");
  const showProSignup = !isLoading && !user && isProPage;

  // Ordine delle categorie per la richiesta di preventivo e la registrazione,
  // chiesto a pagina ferma: aprendole le tessere compaiono subito in ordine (§324).
  useEffect(() => {
    const start = () => prefetchCategoryOrder();
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(start, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Chi ha già fatto l'accesso: campanella e menu scaricati subito, mentre
  // il sito controlla ancora la sessione, così compaiono senza attesa.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    } catch {
      return;
    }
    void loadNotificationBell();
    void loadAccountMenu();
  }, []);

  // Scorrendo la barra diventa più bassa e più trasparente, come su apple.com
  // (richiesta di Luca, docs/changelog/2026-11-11-home-caroselli-larghi.md).
  // Solo trasformazioni (.site-header-shell in globals.css): la barra resta
  // alta 64 px nella pagina, così niente si sposta sotto di lei (le prove
  // misurano zero spostamenti, CLS 0). Due soglie diverse (24 px per
  // stringerla, 4 px per riallargarla) perché non tremi sul confine.
  // Non si accorcia nelle pagine con una barra ferma subito sotto (menu
  // dell'area account e admin, indice del profilo, agenda, mappa dei
  // risultati): tra le due resterebbe una fessura da cui si vede la pagina, e
  // spostare quelle barre muoverebbe il contenuto.
  const [hasStickyBelow, setHasStickyBelow] = useState(false);
  useEffect(() => {
    function onScroll() {
      setScrolled((was) => (was ? window.scrollY > 4 : window.scrollY > 24));
      // Letto a ogni scorrimento (non solo all'apertura): cambiando pagina la
      // barra resta montata e le barre ferme sotto compaiono e spariscono.
      if (window.scrollY > 4) setHasStickyBelow(document.querySelector(STICKY_BELOW_HEADER) !== null);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const compact = scrolled && !hasStickyBelow;

  return (
    // `position: sticky` non è tipizzato su Tamagui/React Native (stesso
    // limite già documentato per ResultsListWithMap.tsx): wrapper DOM
    // grezzo invece del prop Tamagui, che accetta solo i valori che RN
    // supporta (absolute/relative/static).
    <div
      className="site-header-shell"
      data-scrolled={scrolled || undefined}
      data-compact={compact || undefined}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        width: "100%",
      }}
    >
      <div style={{ position: "relative", width: "100%" }}>
      {/* HTML semplice, senza il calcolo degli stili di Tamagui
          (docs/changelog/2026-11-09-barra-in-alto-senza-tamagui.md). */}
      <div className={`is_View ${styles.bar}`}>
        <div className={`is_View ${styles.left}`}>
          <Link href="/" aria-label={`${BRAND.name}, vai alla home`} style={{ textDecoration: "none" }}>
            {/* Solo marchio sotto $xs (≤660px, telefoni): il wordmark
                "Professionisti" (~120px) più Accedi+bottone CTA a destra
                sforavano la larghezza viewport sui telefoni più stretti
                (bug reale segnalato dall'utente, scroll orizzontale sulla
                homepage) — `variant="mark"` esiste già in Logo.web.tsx
                proprio per questo caso ("per spazi stretti"). */}
            <div className={`is_View ${styles.row} ${styles.logoFull}`}>
              <LogoPlain name={BRAND.name} size={26} />
            </div>
            <div className={`is_View ${styles.row} ${styles.logoMark}`}>
              <LogoPlain name={BRAND.name} size={26} variant="mark" />
            </div>
          </Link>
          {isSearchResultsPage ? (
            // Da telefono il menu c'è anche nelle pagine di ricerca: prima
            // mancava solo qui (docs/CHANGELOG.md §271). Su computer resta
            // nascosto, al suo posto c'è la ricerca compatta al centro.
            <MegaMenu mobileOnly />
          ) : (
            <div className={`is_View ${styles.nav}`}>
              <MegaMenu />
              <div className={`is_View ${styles.nav} ${styles.navLinks}`}>
                <Link href="/#come-funziona" style={{ textDecoration: "none" }}>
                  <span className={`is_Text ${styles.navText}`}>Come funziona</span>
                </Link>
                {/* Strumento "Quanto costa in media" della home (richiesta di
                    Luca, docs/CHANGELOG.md §398). */}
                <Link href="/#quanto-costa" style={{ textDecoration: "none" }}>
                  <span className={`is_Text ${styles.navText}`}>Quanto costa</span>
                </Link>
                {/* "Prezzi" (abbonamento dei professionisti) tolto da qui: accanto a
                    "Quanto costa" si confondeva, resta in "Offri i tuoi servizi"
                    (decisione di Luca, docs/CHANGELOG.md §398). */}
                {/* Ingresso alla presentazione per chi offre un servizio, come
                    "Diventa un sitter" su Rover (docs/CHANGELOG.md §173). */}
                {!isLoading && !user?.isProfessional ? (
                  <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
                    <span className={`is_Text ${styles.navText}`}>Offri i tuoi servizi</span>
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className={`is_View ${styles.right}`}>
          {/* "Richiedi preventivo", poi campanella e tondino dell'account
              insieme in fondo a destra (richieste di Luca,
              docs/changelog/2026-11-09-barra-in-alto-semplice.md). */}
          {isLoading || user ? null : (
            <Link href="/accedi" style={{ textDecoration: "none" }}>
              {/* brand.cianografia invece di $blue10 stock (Fase 6): 3.84:1 di
                  contrasto su bianco a questa dimensione, sotto la soglia
                  4.5:1 richiesta per testo normale (Lighthouse color-contrast). */}
              <span className={`is_Text ${styles.loginText}`}>Accedi</span>
            </Link>
          )}
          {/* Nascosto per un account professionista già autenticato (richiesta
              esplicita dell'utente): "Richiedi un preventivo" è un'azione da
              cliente, non pertinente per chi gestisce il proprio profilo
              professionale. `isLoading` va controllato qui esplicitamente
              (bug reale): mentre l'autenticazione è ancora in corso `user`
              è `null`/`undefined`, quindi `!user?.isProfessional`
              risultava vero per un istante anche per un professionista già
              loggato, facendo comparire il bottone per un breve lampo ad
              ogni caricamento di pagina prima di sparire. */}
          {/* Nascosto anche nel profilo di un professionista che accetta
              richieste (`.site-header-cta-link` in globals.css, §385). */}
          {showProSignup ? (
            <Link href="/registrati?ruolo=professionista" className="site-header-cta-link" style={{ textDecoration: "none" }}>
              <Button tabIndex={-1} className="site-header-cta" variant="primary" size="3" height={40} paddingHorizontal="4 xs:3">
                <span className={`is_Text site-header-cta-long ${styles.ctaText} ${styles.ctaText16}`}>Iscriviti gratis</span>
                <span className={`is_Text site-header-cta-short ${styles.ctaText} ${styles.ctaText16}`}>Iscriviti</span>
              </Button>
            </Link>
          ) : !isLoading && !user?.isProfessional && !isAuthPage && !isQuotePage ? (
            <Link href="/preventivo" className="site-header-cta-link" style={{ textDecoration: "none" }}>
              {/* paddingHorizontal ridotto sotto $xs (≤660px): a 320px (iPhone
                  SE, il più stretto tra i telefoni comuni) il bottone a piena
                  dimensione sforava ancora di qualche px anche dopo aver
                  ridotto il logo — stesso bug segnalato dall'utente. Per un
                  cliente già autenticato, la campanella notifiche (nuova,
                  a sinistra del nome) aggiunge ~44px alla riga: sotto $xs
                  l'etichetta si accorcia in "Preventivo" solo in quel caso
                  (mai per un visitatore anonimo, che non ha la campanella e
                  quindi non ha lo stesso problema di spazio) per restare
                  entro la larghezza del viewport senza nasconderlo del
                  tutto. */}
              <Button tabIndex={-1} className="site-header-cta" variant="primary" size="3" height={40} paddingHorizontal="4 xs:3">
                {user ? (
                  <>
                    <span className={`is_Text ${styles.ctaText} ${styles.ctaLong}`}>Richiedi preventivo</span>
                    <span className={`is_Text ${styles.ctaText} ${styles.ctaShort}`}>Preventivo</span>
                  </>
                ) : (
                  // Sotto i 360 px (iPhone SE e simili) logo, menu, "Accedi" e
                  // l'etichetta intera non stanno in una riga: "Preventivo".
                  <>
                    <span className={`is_Text site-header-cta-long ${styles.ctaText} ${styles.ctaText16}`}>Richiedi preventivo</span>
                    <span className={`is_Text site-header-cta-short ${styles.ctaText} ${styles.ctaText16}`}>Preventivo</span>
                  </>
                )}
              </Button>
            </Link>
          ) : null}
          {!isLoading && user ? (
            <div className={`is_View ${styles.account}`}>
              <NotificationBell />
              <AccountMenu />
            </div>
          ) : null}
        </div>
      </div>
      {isSearchResultsPage ? (
        // "Servizi" (MegaMenu, trigger desktop + drawer mobile) nascosto del
        // tutto in questa modalità: la ricerca condensata prende il suo
        // posto su desktop. Richiesta esplicita dell'utente: centrata
        // orizzontalmente nella barra, non più incollata a sinistra accanto
        // al logo — wrapper posizionato assolutamente rispetto al `<div>`
        // relativo che avvolge l'intera riga header (sopra), indipendente
        // dalla larghezza reale di logo/account menu ai due lati. Su
        // schermi stretti (dove la ricerca condensata non ha spazio a
        // sufficienza, §"Ricerca spostata nell'header fisso") il banner
        // completo nel corpo pagina (SearchHeader.tsx) resta l'unico modo
        // di cercare, invariato — stessa soglia `$gtMd` di prima, ora sulla
        // riquadro interno anziché sul wrapper di posizionamento.
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            height: 64,
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div className={`is_View ${styles.row} ${styles.search}`}>
            <Suspense fallback={null}>
              <HeaderSearchBar />
            </Suspense>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
