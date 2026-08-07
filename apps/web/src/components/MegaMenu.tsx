"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, motionBase, motionEasing, motionFast } from "@professionisti/ui";
import { MEGA_MENU_GROUPS, MEGA_MENU_MICRO_DESCRIPTION, categoryBySlug } from "@/lib/megaMenuGroups";

/**
 * "Servizi" nell'header: mega-menu a 3 colonne su desktop (brief §4.1),
 * drawer a tutta altezza con accordion su mobile. Componente web-only
 * (apps/web): interazione da chrome di navigazione, non un primitivo
 * riutilizzabile su mobile (che ha già la propria navigazione nativa).
 */
export function MegaMenu() {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop */}
      <div className="mega-desktop" ref={containerRef}>
        <button
          type="button"
          className="mega-trigger"
          aria-expanded={desktopOpen}
          aria-haspopup="true"
          onClick={() => setDesktopOpen((v) => !v)}
        >
          Servizi
          <span className={`mega-chevron ${desktopOpen ? "open" : ""}`} aria-hidden>
            ▾
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
      <button type="button" className="mega-mobile-trigger" aria-label="Apri menu" onClick={() => setMobileOpen(true)}>
        <span className="mega-burger" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>

      {mobileOpen ? (
        <div className="mega-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <div className="mega-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mega-drawer-header">
              <span>Servizi</span>
              <button type="button" aria-label="Chiudi menu" onClick={() => setMobileOpen(false)} className="mega-drawer-close">
                ×
              </button>
            </div>
            <div className="mega-drawer-body">
              {MEGA_MENU_GROUPS.map((group) => (
                <details key={group.title} className="mega-accordion">
                  <summary>{group.title}</summary>
                  {group.slugs.map((slug) => {
                    const category = categoryBySlug(slug);
                    return (
                      <Link key={slug} href={`/cerca/${slug}`} className="mega-accordion-item" onClick={() => setMobileOpen(false)}>
                        <Icon name={category.icon} size={16} strokeWidth={1.5} />
                        {category.label}
                      </Link>
                    );
                  })}
                </details>
              ))}
            </div>
            <div className="mega-drawer-cta">
              <Link href="/preventivo" onClick={() => setMobileOpen(false)}>
                Richiedi un preventivo →
              </Link>
            </div>
          </div>
        </div>
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
          font-size: 14px;
          font-weight: 600;
          font-family: var(--font-body), sans-serif;
          color: #2b2420;
          padding: 8px 0;
        }
        .mega-chevron {
          font-size: 10px;
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
        .mega-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 14px;
          text-decoration: none;
          color: inherit;
        }
        .mega-item:hover {
          background: #dcf3e7;
        }
        .mega-item-icon {
          flex-shrink: 0;
          margin-top: 2px;
          color: #189a63;
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
        .mega-footer {
          display: block;
          background: #189a63;
          color: #ffffff;
          padding: 14px 24px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        .mega-footer:hover {
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
          justify-content: flex-end;
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
            transform: translateX(100%);
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
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #6e6459;
          line-height: 1;
        }
        .mega-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 20px;
        }
        .mega-accordion {
          border-bottom: 1px solid #fdefe1;
          padding: 12px 0;
        }
        .mega-accordion summary {
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          list-style: none;
        }
        .mega-accordion summary::-webkit-details-marker {
          display: none;
        }
        .mega-accordion-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 4px 10px 8px;
          text-decoration: none;
          color: #2b2420;
          font-size: 14px;
        }
        .mega-drawer-cta {
          padding: 16px 20px;
          border-top: 1px solid #f0dcc0;
        }
        .mega-drawer-cta a {
          display: block;
          text-align: center;
          background: #189a63;
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
