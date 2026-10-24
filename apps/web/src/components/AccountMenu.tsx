"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Icon, Text, YStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { getAccountMenuGroups, isNavItemActive } from "@/lib/accountMenuItems";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";
import { useNavAttention } from "@/lib/useNavAttention";

export function AccountMenu() {
  const { user, logout, unreadCount, unreadNotifications } = useAuth();
  const attention = useNavAttention();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Si chiude cambiando pagina (già durante il render) e con Esc.
  const [openPathname, setOpenPathname] = useState(pathname);
  if (pathname !== openPathname) {
    setOpenPathname(pathname);
    setIsOpen(false);
  }
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const groups = getAccountMenuGroups(user.isProfessional);

  // Richiesta esplicita dell'utente: un professionista è identificato dalla
  // propria attività, non dal nome dell'intestatario dell'account — un
  // cliente vede invece sempre il proprio nome come prima. `businessName`
  // resta `null` per un professionista che non ha ancora creato il
  // profilo (subito dopo la registrazione): ricade sul nome personale
  // finché non lo fa, invece di mostrare un'etichetta vuota. `isProfessional`
  // (non `role`) regge anche un admin promosso che aveva già un profilo.
  const displayName = user.isProfessional ? user.businessName ?? user.name ?? user.email : user.name ?? user.phone ?? user.email;
  // Richiesta esplicita dell'utente: l'icona in alto a destra mostra
  // l'immagine profilo pubblica del professionista (ProfessionalProfile.
  // imageUrl) quando disponibile, non le sole iniziali — `user.imageUrl`
  // (User.imageUrl) resta sempre null per un professionista, l'upload in
  // /account è disabilitato per quel ruolo.
  const displayImageUrl = user.isProfessional ? user.businessImageUrl ?? user.imageUrl : user.imageUrl;

  // Numeretto per voce di menu (richiesta esplicita dell'utente: oltre al
  // totale accanto al nome, deve comparire anche sulla voce del sottomenu
  // che porta alla pagina con la novità, es. "Dashboard"/"Le mie visite").
  const menuUnreadCounts = accountMenuUnreadCounts(user.isProfessional, unreadNotifications);
  // Qualcosa da fare (agenda, percorso del profilo): pallino anche accanto al nome.
  const toDo = attention.size > 0;

  return (
    <YStack ref={containerRef} position="relative">
      <YStack
        flexDirection="row"
        alignItems="center"
        gap="$1"
        cursor="pointer"
        onPress={() => setIsOpen((open) => !open)}
        accessibilityRole="button"
      >
        {/* Niente etichetta separata: il nome letto è il testo visibile, più
            le novità solo per il lettore di schermo (WCAG 2.5.3, docs/CHANGELOG.md §310). */}
        <span aria-hidden="true" style={{ display: "flex" }}>
          <Avatar name={displayName ?? "?"} imageUrl={displayImageUrl} size={24} />
        </span>
        {/* Da telefono resta solo la foto: un nome lungo spingeva fuori
            schermo "Richiedi preventivo" (docs/CHANGELOG.md §319). Il nome
            resta per il lettore di schermo. */}
        <span className="acct-trigger-name">
          <Text fontSize="$3" fontWeight="600" color={brand.grafite} numberOfLines={1}>
            {displayName ?? "Il mio account"}
          </Text>
        </span>
        <span className="sr-only acct-trigger-name-sr">{displayName ?? "Il mio account"}</span>
        <span className="sr-only">
          {displayName ? ", il mio account" : ""}
          {unreadCount > 0 ? `, ${unreadCount} novità da visualizzare` : toDo ? ", qualcosa da completare" : ""}
        </span>
        {unreadCount > 0 ? (
          <span aria-hidden="true">
            <YStack
              backgroundColor={brand.urgenza}
              borderRadius={999}
              minWidth={18}
              height={18}
              paddingHorizontal={4}
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </YStack>
          </span>
        ) : toDo ? (
          // Stesso pallino delle voci del menu: da telefono restano fuori schermo nella barra.
          <span className="acct-nav-dot" style={{ marginLeft: 2 }} aria-hidden="true" />
        ) : null}
        <span aria-hidden="true">
          <Text fontSize="$2" color={brand.grafite70}>
            {isOpen ? "▲" : "▼"}
          </Text>
        </span>
      </YStack>

      {isOpen ? (
        // Stessi gruppi e icone del menu laterale (docs/CHANGELOG.md §148):
        // intestazione con chi sei, poi le sezioni, "Esci" in fondo.
        <div className="acct-menu" role="menu" aria-label="Il mio account">
          <div className="acct-menu-head">
            <Avatar name={displayName ?? "?"} imageUrl={displayImageUrl} size={36} />
            <div className="acct-menu-head-text">
              <strong>{displayName}</strong>
              <span>{user.isProfessional ? "Account professionista" : user.email ?? "Il tuo account"}</span>
            </div>
          </div>
          {groups.map((group) => (
            <div key={group.title}>
              <span className="acct-menu-title">{group.title}</span>
              {group.items.map((item) => {
                const itemUnreadCount = menuUnreadCounts[item.href] ?? 0;
                const active = isNavItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={`acct-menu-link${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon name={item.icon} size={16} color={active ? brand.grafite : brand.grafite70} />
                    <span>{item.label}</span>
                    {itemUnreadCount > 0 ? <span className="acct-nav-badge">{itemUnreadCount > 9 ? "9+" : itemUnreadCount}</span> : attention.has(item.href) ? <span className="acct-nav-dot" role="img" aria-label="Da completare" /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="acct-menu-logout">
            <button
              type="button"
              role="menuitem"
              className="acct-menu-link"
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              aria-label="Esci dal tuo account"
            >
              Esci
            </button>
          </div>
        </div>
      ) : null}
    </YStack>
  );
}
