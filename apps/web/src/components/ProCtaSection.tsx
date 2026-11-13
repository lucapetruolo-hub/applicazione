"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon, brand } from "@professionisti/ui";
import { GlowLights } from "./GlowLights";
import styles from "./ProCtaSection.module.css";

// Solo cose che il sito fa già (docs/CHANGELOG.md §307): "Richieste
// filtrate dall'IA · In arrivo" è stata tolta su scelta dell'utente perché
// prometteva una funzione che non c'è.
const COLUMNS = [
  {
    icon: "receipt-text" as const,
    title: "Agenda e preventivi",
    text: "Agenda, preventivi e fatturazione in un'unica dashboard. Senza fogli di calcolo o WhatsApp sparsi.",
  },
  {
    icon: "map-pin" as const,
    title: "Richieste della tua zona",
    text: "Ti arrivano le richieste dei clienti nel tuo raggio di lavoro, con foto e descrizione. Nessun costo per contatto.",
  },
];

/**
 * Sezione di acquisizione lato offerta: riquadro scuro con una foto di un
 * professionista al lavoro a lato (direzione "C" della homepage scelta
 * dall'utente, docs/CHANGELOG.md §219 — prima era un fondo verde pieno senza
 * persone). Foto: cottonbro studio, pexels.com/photo/6791546 (licenza Pexels,
 * uso commerciale libero senza attribuzione obbligatoria).
 *
 * Luci colorate sfocate che si muovono piano sul fondo scuro e due notifiche
 * d'esempio sopra la foto (idea presa dal sito Volt, scelta dall'utente solo
 * per questa sezione, docs/CHANGELOG.md §219): mostrano cosa arriva a un
 * professionista. Sono decorative (`aria-hidden`), stile in globals.css.
 */
export function ProCtaSection() {
  return (
    <div className={`is_View ${styles.wrap}`}>
      <div className="pro-cta">
        <GlowLights tone="scuro" pressBoost />
        <div className={`is_View ${styles.content}`}>
          <div className={`is_View ${styles.titleBox}`}>
            <span className={`is_Text font_heading ${styles.title}`}>Meno telefonate inutili, più lavori fatti.</span>
          </div>

          <div className={`is_View ${styles.columns}`}>
            {COLUMNS.map((column) => (
              <div key={column.title} className={`is_View ${styles.column}`}>
                <div className={`is_View ${styles.iconBox}`}>
                  <Icon name={column.icon} size={22} color="white" strokeWidth={1.5} />
                </div>
                <div className={`is_View ${styles.columnText}`}>
                  <span className={`is_Text font_heading ${styles.columnTitle}`}>{column.title}</span>
                  <span className={`is_Text ${styles.columnBody}`}>{column.text}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`is_View ${styles.buttons}`}>
            <Link href="/registrati?ruolo=professionista" data-glow-boost style={{ textDecoration: "none" }}>
              <div className={`is_View ${styles.button} ${styles.buttonSolid}`}>
                <span className={`is_Text ${styles.buttonSolidLabel}`}>Iscriviti gratis</span>
              </div>
            </Link>
            <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
              <div className={`is_View ${styles.button} ${styles.buttonOutline}`}>
                <span className={`is_Text ${styles.buttonOutlineLabel}`}>Vedi i piani</span>
              </div>
            </Link>
          </div>
        </div>
        <div className="pro-cta-photo">
          <Image
            src="/home-photos/professionista-al-lavoro.webp"
            alt="Un falegname al lavoro nella sua bottega"
            fill
            sizes="(max-width: 860px) 100vw, 556px"
            style={{ objectFit: "cover" }}
          />
          <div className="pro-cta-notif pro-cta-notif-top" aria-hidden>
            <span className="pro-cta-notif-icon" style={{ background: brand.verificato }}>
              <Icon name="check" size={18} color="white" strokeWidth={2.5} />
            </span>
            <span>
              <strong>Preventivo accettato</strong>
              <small>€ 93 · giovedì 9:00</small>
            </span>
          </div>
          <div className="pro-cta-notif pro-cta-notif-bottom" aria-hidden>
            <span className="pro-cta-notif-icon" style={{ background: brand.cianografiaPieno }}>
              <Icon name="bell-ring" size={18} color="white" strokeWidth={2} />
            </span>
            <span>
              <strong>Nuova richiesta</strong>
              <small>Rubinetto che perde · Milano · 1 foto</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
