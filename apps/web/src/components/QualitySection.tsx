"use client";

import Link from "next/link";
import { Icon, Section, brand } from "@professionisti/ui";
import { useOnlinePayments } from "@/lib/onlinePayments";
import styles from "./QualitySection.module.css";

const POINTS: { title: string; text: string; online?: boolean }[] = [
  {
    title: "Preventivo strutturato",
    text: "Manodopera, materiali e tempi separati.",
  },
  {
    title: "Recensioni solo da lavori fatti tramite il sito",
    text: "Le lascia solo chi ha prenotato sul sito.",
  },
  {
    title: "Contatti privati",
    text: "Telefono e indirizzo solo se accetti un preventivo.",
  },
  {
    // Documento e selfie con Didit (docs/CHANGELOG.md §253), non
    // l'assicurazione RC (resta "dichiarata" sul profilo).
    title: "Badge Verificato",
    text: "Identità controllata con documento e selfie.",
  },
  {
    title: "Pagamento online protetto",
    text: "I soldi restano bloccati fino alla tua conferma.",
    online: true,
  },
  {
    title: "Assistenza e rimborso",
    text: "Con il pagamento online, se qualcosa va storto ti aiutiamo.",
    online: true,
  },
];

/**
 * Perché fidarsi, in un blocco solo (docs/CHANGELOG.md §349). Prima erano tre
 * tessere con l'icona in un cerchio ("La trasparenza che non trovi in giro")
 * più una scheda "Come ti proteggiamo" con cinque punti e due chip "In
 * arrivo": lo stesso messaggio tre volte (col piè di pagina) e due garanzie
 * promesse per il futuro in mezzo a quelle vere, che facevano dubitare
 * anche delle altre. Ora un elenco con le spunte; i due punti sul pagamento
 * online compaiono solo quando Stripe è attivo (`useOnlinePayments`, §170).
 * Ogni punto riflette lo stato reale del sito: recensioni solo da lavori
 * confermati (CLAUDE.md §8), contatti privati fino all'accettazione (§5
 * punto 9), identità con documento e selfie (§253), pagamento online con
 * acconto e saldo bloccati e rimborso sulle segnalazioni accolte (§168).
 * Prima era l'unico blocco scuro della pagina; dal 08/11/2026 è chiaro, in un
 * riquadro bianco come le altre schede, per una home più pulita e ordinata
 * (spunti da miodottore, scelta di Luca,
 * docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md). Una riga
 * per punto; i dettagli (7 giorni, rimborso sulle segnalazioni accolte) stanno
 * in /problemi-e-rimborsi, dietro "Scopri di più".
 */
export function QualitySection() {
  const onlinePayments = useOnlinePayments();
  const points = POINTS.filter((point) => !point.online || onlinePayments);
  return (
    <Section title="La trasparenza che non trovi in giro" maxWidth={1080}>
      <div className={`is_View ${styles.panel}`} data-stagger="">
        {points.map((point) => (
          <div key={point.title} className={`is_View ${styles.point}`}>
            <div className={`is_View ${styles.check}`}>
              <Icon name="check" size={15} strokeWidth={2.5} color={brand.cianografiaScuro} />
            </div>
            <span className={`is_Text ${styles.text}`}>
              <span className={`is_Text font_body ${styles.title}`}>{point.title}.</span> {point.text}
            </span>
          </div>
        ))}
      </div>
      <Link href="/problemi-e-rimborsi" className="home-section-action">
        Scopri di più
      </Link>
    </Section>
  );
}
