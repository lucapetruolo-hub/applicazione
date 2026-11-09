"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/IntentLink";
import { usePathname } from "next/navigation";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { Icon, motionBase, motionEasing, motionFast } from "@professionisti/ui";
import { MEGA_MENU_GROUPS, MEGA_MENU_MICRO_DESCRIPTION, categoryBySlug } from "@/lib/megaMenuGroups";
import { useAuth } from "@/lib/AuthContext";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

/**
 * "Servizi" nell'header: mega-menu a 3 colonne su desktop (brief §4.1),
 * drawer a tutta altezza con accordion su mobile. Componente web-only
 * (apps/web): interazione da chrome di navigazione, non un primitivo
 * riutilizzabile su mobile (che ha già la propria navigazione nativa).
 */
/**
 * `mobileOnly`: solo l'hamburger, senza il "Servizi" da computer. Usato nelle
 * pagine di ricerca, dove su computer al suo posto c'è la ricerca compatta,
 * così da telefono il menu c'è in tutte le pagine (docs/CHANGELOG.md §271).
 */
// Mestieri del menu da telefono in ordine alfabetico: un ordine neutro, mai
// per numero di professionisti (docs/changelog/2026-11-09-menu-tre-righe.md).
const MOBILE_CATEGORIES = [...PROFESSIONAL_CATEGORIES].sort((a, b) => a.label.localeCompare(b.label, "it"));

/**
 * Menu con le tre righe da telefono = "il sito" (mestieri, come funziona,
 * prezzi, offrire i propri servizi); il tondino dell'account a destra = "il
 * mio account". Prima ripeteva tutte le voci dell'account (17 per un
 * professionista), già nel tondino e nelle schede dell'area privata. Non
 * compare nell'area del professionista e in Admin, che hanno le loro schede
 * (scelta di Luca, docs/changelog/2026-11-09-menu-tre-righe.md).
 */
export function MegaMenu({ mobileOnly = false }: { mobileOnly?: boolean } = {}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const inPrivateArea = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  // Si chiude cambiando pagina, anche col tasto "indietro".
  const [openPathname, setOpenPathname] = useState(pathname);
  if (pathname !== openPathname) {
    setOpenPathname(pathname);
    setMobileOpen(false);
  }
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDesktopOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDesktopOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Menu aperto: pagina sotto ferma e barra in basso del profilo nascosta,
  // come nel menu dell'account (classe sull'<html>, regole in globals.css).
  // Il fuoco entra nel menu e alla chiusura torna sulle tre righe.
  useEffect(() => {
    if (!mobileOpen) return;
    const root = document.documentElement;
    const trigger = triggerRef.current;
    root.classList.add("site-menu-open");
    drawerRef.current?.querySelector<HTMLElement>(".mega-drawer-close")?.focus({ preventScroll: true });
    return () => {
      root.classList.remove("site-menu-open");
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  // Col Tab il fuoco resta dentro il menu aperto.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button") ?? []);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop */}
      <div className="mega-desktop" ref={containerRef} style={mobileOnly ? { display: "none" } : undefined}>
        <button
          type="button"
          className="mega-trigger"
          aria-expanded={desktopOpen}
          aria-haspopup="true"
          onClick={() => setDesktopOpen((v) => !v)}
        >
          Servizi
          {/* Stessa freccina sottile della barra in alto (docs/changelog/2026-11-09-barra-in-alto-semplice.md). */}
          <span className={`mega-chevron ${desktopOpen ? "open" : ""}`} aria-hidden>
            <Icon name="chevron-down" size={14} color="currentColor" />
          </span>
        </button>
        {desktopOpen ? (
          <div className="mega-panel">
            <div className="mega-columns">
              {MEGA_MENU_GROUPS.map((group) => (
                <div key={group.title} className="mega-column">
                  <span className="mega-column-title">{group.title}</span>
                  {group.slugs.map((slug) => {
                    const category = categoryBySlug(slug);
                    return (
                      <Link key={slug} href={`/cerca/${slug}`} className="mega-item" onClick={() => setDesktopOpen(false)}>
                        <span className="mega-item-icon">
                          <Icon name={category.icon} size={18} strokeWidth={1.5} />
                        </span>
                        <span className="mega-item-text">
                          <span className="mega-item-name">{category.label}</span>
                          <span className="mega-item-desc">{MEGA_MENU_MICRO_DESCRIPTION[slug]}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
            <Link href="/preventivo" className="mega-footer" onClick={() => setDesktopOpen(false)}>
              Non trovi il tuo servizio? Descrivilo →
            </Link>
          </div>
        ) : null}
      </div>

      {/* Mobile trigger */}
      <button
        ref={triggerRef}
        type="button"
        className="mega-mobile-trigger"
        aria-label="Apri menu"
        aria-expanded={mobileOpen}
        aria-haspopup="dialog"
        style={inPrivateArea ? { display: "none" } : undefined}
        onClick={() => setMobileOpen(true)}
      >
        <span className="mega-burger" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* Portal su document.body: l'header sticky ha backdrop-filter, che
          per spec CSS diventa il containing block dei discendenti position:fixed
          e schiacciava il drawer dentro i 64px dell'header (bug mobile reale). */}
      {mobileOpen && typeof document !== "undefined" ? (
        createPortal(
        <div className="mega-drawer-backdrop" role="presentation" onClick={closeOnBackdrop(() => setMobileOpen(false))}>
          <div ref={drawerRef} className="mega-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="mega-drawer-header">
              <span>Menu</span>
              <button type="button" aria-label="Chiudi menu" onClick={() => setMobileOpen(false)} className="mega-drawer-close">
                <Icon name="x" size={22} color="currentColor" />
              </button>
            </div>
            <div className="mega-drawer-body">
              {/* Link di navigazione principali (su mobile l'header li
                  nasconde: qui restano raggiungibili) */}
              <div className="mega-navlinks">
                <Link href="/#come-funziona" className="mega-navlink" onClick={() => setMobileOpen(false)}>
                  Come funziona
                </Link>
                <Link href="/#quanto-costa" className="mega-navlink" onClick={() => setMobileOpen(false)}>
                  Quanto costa
                </Link>
                {!isLoading && !user?.isProfessional ? (
                  <Link href="/per-professionisti" className="mega-navlink" onClick={() => setMobileOpen(false)}>
                    Offri i tuoi servizi
                  </Link>
                ) : null}
              </div>
              <div className="mega-section-label" id="mega-mestieri">Cerca per mestiere</div>
              <ul className="mega-categories" aria-labelledby="mega-mestieri">
                {MOBILE_CATEGORIES.map((category) => (
                  <li key={category.slug}>
                    <Link href={`/cerca/${category.slug}`} className="mega-category" onClick={() => setMobileOpen(false)}>
                      <span className="mega-category-icon" aria-hidden>
                        <Icon name={category.icon} size={18} strokeWidth={1.5} />
                      </span>
                      {category.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* Azione da cliente: come nell'header, non per un professionista. */}
            {!user?.isProfessional ? (
              <div className="mega-drawer-cta">
                <Link href="/preventivo" onClick={() => setMobileOpen(false)}>
                  Richiedi un preventivo →
                </Link>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
        )
      ) : null}

      <style jsx>{`
        .mega-desktop {
          position: relative;
          display: none;
        }
        .mega-trigger {
          display: flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          font-family: var(--font-body), sans-serif;
          color: #2b2420;
          padding: 8px 0;
        }
        .mega-chevron {
          display: inline-flex;
          transition: transform ${motionFast} ${motionEasing};
        }
        .mega-chevron.open {
          transform: rotate(180deg);
        }
        .mega-panel {
          position: absolute;
          top: calc(100% + 12px);
          left: -24px;
          width: 640px;
          background: #ffffff;
          border: none;
          border-radius: 24px;
          box-shadow: 0 4px 12px rgba(43, 32, 19, 0.02);
          overflow: hidden;
          animation: mega-fade ${motionFast} ${motionEasing};
          z-index: 50;
        }
        @keyframes mega-fade {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .mega-columns {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          padding: 24px;
        }
        .mega-column {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mega-column-title {
          font-family: var(--font-body), sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #6e6459;
          margin-bottom: 8px;
        }
        /* Le regole che hanno come target un next/link usano :global():
           styled-jsx non aggiunge la classe di scope ai componenti (solo
           agli elementi host), quindi .mega-item.jsx-XXX non matcherebbe
           mai la <a> renderizzata da Link (link del menu senza stile). */
        :global(.mega-item) {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 14px;
          text-decoration: none;
          color: inherit;
        }
        :global(.mega-item:hover) {
          background: #dcf3e7;
        }
        .mega-item-icon {
          flex-shrink: 0;
          margin-top: 2px;
          color: #0e7a4c;
        }
        .mega-item-text {
          display: flex;
          flex-direction: column;
        }
        .mega-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #2b2420;
        }
        .mega-item-desc {
          font-size: 12px;
          color: #6e6459;
        }
        :global(.mega-footer) {
          display: block;
          background: #128552;
          color: #ffffff;
          padding: 14px 24px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        :global(.mega-footer:hover) {
          background: #0e7a4c;
        }

        .mega-mobile-trigger {
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
        }
        .mega-burger {
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 20px;
        }
        .mega-burger span {
          display: block;
          height: 2px;
          background: #2b2420;
          border-radius: 1px;
        }

        .mega-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(43, 32, 19, 0.45);
          z-index: 100;
          display: flex;
          justify-content: flex-start;
        }
        .mega-drawer {
          width: 320px;
          max-width: 85vw;
          height: 100%;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          animation: mega-slide ${motionBase} ${motionEasing};
        }
        @keyframes mega-slide {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .mega-drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #f0dcc0;
          font-weight: 700;
          font-size: 16px;
        }
        .mega-drawer-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          margin: -12px -12px -12px 0;
          background: none;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          color: #6e6459;
        }
        .mega-drawer-close:hover {
          background: #efe9e2;
        }
        .mega-drawer-body {
          flex: 1;
          overflow-y: auto;
          /* Arrivati in fondo non trascina la pagina sotto. */
          overscroll-behavior: contain;
          padding: 12px 20px;
        }
        .mega-navlinks {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f0dcc0;
          margin-bottom: 4px;
        }
        :global(.mega-navlink) {
          padding: 10px 4px;
          text-decoration: none;
          color: #2b2420;
          font-size: 15px;
          font-weight: 600;
        }
        .mega-section-label {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6e6459;
          padding: 8px 4px 4px;
        }
        .mega-categories {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        :global(.mega-category) {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 44px;
          padding: 0 4px;
          border-radius: 10px;
          text-decoration: none;
          color: #2b2420;
          font-size: 15px;
          font-weight: 600;
        }
        :global(.mega-category:hover) {
          background: #efe9e2;
        }
        .mega-category-icon {
          display: inline-flex;
          color: #0e7a4c;
        }
        .mega-drawer-cta {
          padding: 16px 20px;
          border-top: 1px solid #f0dcc0;
        }
        :global(.mega-drawer-cta a) {
          display: block;
          text-align: center;
          background: #128552;
          color: white;
          padding: 12px;
          border-radius: 14px;
          text-decoration: none;
          font-weight: 600;
        }

        @media (min-width: 860px) {
          .mega-desktop {
            display: block;
          }
          .mega-mobile-trigger {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
