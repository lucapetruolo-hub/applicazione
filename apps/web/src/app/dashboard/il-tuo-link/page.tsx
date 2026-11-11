"use client";

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BRAND,
  colleagueInviteMessage,
  inviteLinkPath,
  personalInviteMessage,
  personalLinkBadgeHtml,
  personalLinkBadgeLabel,
  personalLinkBadgePath,
  personalLinkButtonHtml,
  type MyPersonalLink,
  type PersonalLinkBadgeTheme,
} from "@professionisti/shared";
import { Button, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SITE_URL } from "@/lib/siteUrl";
import { WaitBarSignal } from "@/components/WaitBar";
import { PageLoading } from "@/components/PageLoading";

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${brand.bordoCampo}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  background: brand.calce,
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Il QR come PNG grande (1024 px): lo apre ogni telefono e ogni tipografia. Se il browser non ci riesce, l'SVG. */
async function downloadQr(svg: string, fileName: string): Promise<void> {
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const save = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  try {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, 1024, 1024);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, 1024, 1024);
    save(canvas.toDataURL("image/png"), `${fileName}.png`);
  } catch {
    save(svgUrl, `${fileName}.svg`);
  }
}

/**
 * "Il tuo link" del professionista (gruppo 11 del controllo dell'8/11,
 * docs/changelog/2026-11-08-canale-del-professionista.md): link personale
 * corto con QR, e "Invita un tuo cliente" con un messaggio già pronto che il
 * professionista manda dal suo telefono (noi non scriviamo ai suoi clienti).
 * Le richieste da questo link sono clienti suoi: arrivano solo a lui e i
 * lavori non contano nei lavori del mese.
 */
export default function PersonalLinkPage() {
  return (
    <Suspense fallback={null}>
      <PersonalLinkContent />
    </Suspense>
  );
}

function PersonalLinkContent() {
  const { user, token, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const [link, setLink] = useState<MyPersonalLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "message" | "code" | "badge" | "colleague" | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Da "Invita questo cliente" di un lavoro aggiunto da te: il nome è già scritto.
  const [clientName, setClientName] = useState(() => (searchParams.get("nome") ?? "").slice(0, 60));
  // Il messaggio si riscrive col nome finché il professionista non lo cambia a mano.
  const [editedMessage, setEditedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    apiClient
      .getMyPersonalLink(token)
      .then(setLink)
      .catch((err) => setError(err instanceof Error ? err.message : "Non riusciamo a caricare il tuo link. Riprova."));
  }, [token, user?.isProfessional]);

  useEffect(() => {
    // navigator.share esiste solo nel browser (telefoni soprattutto): dopo il primo disegno.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const url = link ? `${SITE_URL}${link.path}` : "";
  const shownUrl = url.replace(/^https?:\/\//, "");
  const message = useMemo(
    () => editedMessage ?? (link ? personalInviteMessage({ clientName, businessName: link.businessName, siteName: BRAND.name, url }) : ""),
    [editedMessage, link, clientName, url],
  );
  const buttonHtml = url ? personalLinkButtonHtml(url) : "";
  // Bollino con le stelle e "Porta un collega" (docs/changelog/2026-11-09-passaparola.md).
  const [badgeTheme, setBadgeTheme] = useState<PersonalLinkBadgeTheme>("light");
  const badgeUrl = link ? `${SITE_URL}${personalLinkBadgePath(link.code, badgeTheme)}` : "";
  const badgeAlt = link ? personalLinkBadgeLabel({ rating: link.rating, reviewCount: link.reviewCount, siteName: BRAND.name }) : "";
  const badgeHtml = link ? personalLinkBadgeHtml(url, badgeUrl, badgeAlt) : "";
  const colleagueUrl = link ? `${SITE_URL}${inviteLinkPath(link.code)}` : "";
  const colleagueMessage = link ? colleagueInviteMessage({ businessName: link.businessName, siteName: BRAND.name, url: colleagueUrl }) : "";
  const qrSrc = link ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(link.qrSvg)}` : "";

  async function copy(text: string, what: "link" | "message" | "code" | "badge" | "colleague") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copia non riuscita: tieni premuto sul testo per copiarlo.");
    }
  }

  async function share(text: string) {
    try {
      await navigator.share({ text });
    } catch {
      // Condivisione chiusa dal professionista: niente da fare.
    }
  }

  // Sagoma e barra di attesa al posto della pagina vuota (docs/changelog/2026-11-10-barra-in-ogni-attesa.md).
  if (isLoading) return <PageLoading />;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <YStack width="100%" maxWidth={480} gap="4" alignItems="center">
          <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/il-tuo-link" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary">
              Accedi
            </Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite} textAlign="center">
          Questa sezione è per i professionisti
        </Text>
      </YStack>
    );
  }

  const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(`Preventivi e appuntamenti con ${link?.businessName ?? ""}`)}&body=${encodeURIComponent(message)}`;

  return (
    <YStack width="100%" alignItems="center" paddingVertical="8" paddingHorizontal="4">
      <YStack width="100%" maxWidth={880} gap="5">
        <YStack gap="2">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize={30} color={brand.inchiostro}>
            Il tuo link
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            Mandalo ai tuoi clienti: le loro richieste arrivano solo a te e i lavori non contano nel tuo abbonamento.{" "}
            <button type="button" className="link-button" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
              {moreOpen ? "Chiudi" : "Scopri di più"}
            </button>
          </Text>
          {moreOpen ? (
            <Surface borderRadius={radiusDoc} padding="4" gap="2" backgroundColor={brand.cianografiaVelo}>
              <Text color={brand.grafite}>• Chi apre il tuo link arriva al tuo profilo e ti chiede un preventivo come sempre.</Text>
              <Text color={brand.grafite}>• Il lavoro non conta nei lavori del mese, anche quando li hai finiti: a questi clienti puoi sempre rispondere.</Text>
              <Text color={brand.grafite}>• La richiesta non passa ad altri professionisti, a meno che sia il cliente a sceglierlo.</Text>
              <Text color={brand.grafite}>• Vale per i clienti nuovi sul sito. Chi ti aveva già trovato con la ricerca resta un cliente arrivato dal sito.</Text>
            </Surface>
          ) : null}
        </YStack>

        {error ? (
          <Text color={brand.urgenza} role="alert">
            {error}
          </Text>
        ) : null}
        {!link && !error ? <Text color={brand.grafite70}>
            Caricamento...
            <WaitBarSignal />
          </Text> : null}

        {link ? (
          <>
            <Surface gap="3">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Il tuo link personale
              </Text>
              <XStack
                borderWidth={1}
                borderColor={brand.filetto}
                borderRadius={10}
                paddingVertical="3"
                paddingHorizontal="4"
                backgroundColor={brand.gesso}
                alignItems="center"
              >
                <Text fontSize={18} fontWeight="700" color={brand.grafite} userSelect="all" style={{ overflowWrap: "anywhere" }}>
                  {shownUrl}
                </Text>
              </XStack>
              <XStack gap="2" flexWrap="wrap">
                <Button variant="primary" onPress={() => void copy(url, "link")}>
                  {copied === "link" ? "Link copiato" : "Copia il link"}
                </Button>
                {canShare ? (
                  <Button variant="secondary" icon={<Icon name="share-2" size={18} color={brand.grafite} />} onPress={() => void share(url)}>
                    Condividi
                  </Button>
                ) : null}
              </XStack>
              <Text fontSize={14} color={brand.grafite70}>
                {link.opensThisPeriod > 0
                  ? `In questo periodo ${link.opensThisPeriod === 1 ? "una persona ha" : `${link.opensThisPeriod} persone hanno`} aperto il tuo link. `
                  : ""}
                {link.requestsThisPeriod === 0 && link.jobsThisPeriod === 0
                  ? link.opensThisPeriod > 0
                    ? "Ancora nessuna richiesta da lì."
                    : "Ancora nessuna richiesta dal tuo link in questo periodo."
                  : `${link.opensThisPeriod > 0 ? "Da lì" : "In questo periodo"}: ${plural(link.requestsThisPeriod, "richiesta", "richieste")} e ${plural(link.jobsThisPeriod, "lavoro preso", "lavori presi")}, che non contano nel tuo abbonamento.`}
              </Text>
            </Surface>

            <Surface gap="3">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Invita un tuo cliente
              </Text>
              <Text color={brand.grafite70}>Il messaggio parte dal tuo telefono o dalla tua email: noi non scriviamo ai tuoi clienti.</Text>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Text render="span" fontWeight="600" color={brand.grafite}>
                  Nome del cliente (facoltativo)
                </Text>
                <input
                  style={fieldStyle}
                  value={clientName}
                  maxLength={60}
                  autoComplete="off"
                  onChange={(event) => setClientName(event.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Text render="span" fontWeight="600" color={brand.grafite}>
                  Messaggio
                </Text>
                <textarea
                  style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.45 }}
                  rows={6}
                  value={message}
                  maxLength={1000}
                  onChange={(event) => setEditedMessage(event.target.value)}
                />
              </label>
              {editedMessage !== null ? (
                <button type="button" className="link-button is-quiet" style={{ alignSelf: "flex-start" }} onClick={() => setEditedMessage(null)}>
                  Rimetti il messaggio di partenza
                </button>
              ) : null}
              <XStack gap="2" flexWrap="wrap">
                <a href={whatsAppHref} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <Button tabIndex={-1} variant="primary" icon={<Icon name="message-circle" size={18} color="white" />}>
                    Manda con WhatsApp
                  </Button>
                </a>
                <a href={mailHref} style={{ textDecoration: "none" }}>
                  <Button tabIndex={-1} variant="secondary" icon={<Icon name="mail" size={18} color={brand.grafite} />}>
                    Manda per email
                  </Button>
                </a>
                {canShare ? (
                  <Button variant="secondary" icon={<Icon name="share-2" size={18} color={brand.grafite} />} onPress={() => void share(message)}>
                    Altro
                  </Button>
                ) : (
                  <Button variant="secondary" onPress={() => void copy(message, "message")}>
                    {copied === "message" ? "Messaggio copiato" : "Copia il messaggio"}
                  </Button>
                )}
              </XStack>
            </Surface>

            <Surface gap="3">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Codice QR
              </Text>
              <XStack gap="4" flexWrap="wrap" alignItems="center">
                {/* eslint-disable-next-line @next/next/no-img-element -- immagine SVG generata, niente ottimizzazione da fare */}
                <img src={qrSrc} alt={`Codice QR del link ${shownUrl}`} width={168} height={168} style={{ borderRadius: 10, border: `1px solid ${brand.filetto}`, background: "#fff" }} />
                <YStack gap="3" flex={1} minWidth={220}>
                  <Text color={brand.grafite70}>
                    Stampalo su biglietti da visita, volantini, preventivi di carta o sul furgone: chi lo inquadra con il telefono arriva al tuo profilo.
                  </Text>
                  <Button
                    alignSelf="flex-start"
                    variant="secondary"
                    icon={<Icon name="download" size={18} color={brand.grafite} />}
                    onPress={() => void downloadQr(link.qrSvg, `qr-${link.code}`)}
                  >
                    Scarica il QR
                  </Button>
                </YStack>
              </XStack>
            </Surface>

            <Surface gap="2">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Mettilo dove ti cercano
              </Text>
              <Text color={brand.grafite70}>
                Nella tua scheda Google (Google Business Profile) incollalo come link per gli appuntamenti, e aggiungilo alla pagina Facebook e allo stato di WhatsApp.
              </Text>
            </Surface>

            <Surface gap="3">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Pulsante per il tuo sito
              </Text>
              <Text color={brand.grafite70}>
                Hai un sito? Copia il codice e incollalo dove vuoi il pulsante (in WordPress, Wix e simili si usa il blocco &quot;HTML&quot;).
              </Text>
              {/* Anteprima: com'è il pulsante del codice qui sotto. */}
              <a
                href={url}
                target="_blank"
                rel="noopener"
                style={{ alignSelf: "flex-start", display: "inline-block", padding: "12px 22px", borderRadius: 999, background: brand.cianografiaPieno, color: "#ffffff", font: "600 16px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", textDecoration: "none" }}
              >
                Chiedi un preventivo
              </a>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 14, color: brand.grafite70 }}>Codice del pulsante</span>
                <textarea
                  readOnly
                  style={{ ...fieldStyle, resize: "vertical", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 13, lineHeight: 1.45 }}
                  rows={4}
                  value={buttonHtml}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <Button alignSelf="flex-start" variant="secondary" onPress={() => void copy(buttonHtml, "code")}>
                {copied === "code" ? "Codice copiato" : "Copia il codice"}
              </Button>
            </Surface>

            <Surface gap="3">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Le tue stelle sul tuo sito
              </Text>
              <Text color={brand.grafite70}>
                {link.reviewCount > 0
                  ? "Un bollino con il tuo voto e il numero delle recensioni, sempre aggiornato. Chi lo tocca arriva al tuo profilo."
                  : "Un bollino che si aggiorna da solo: oggi invita a chiederti un preventivo, con le prime recensioni mostra il tuo voto."}
              </Text>
              <div role="group" aria-label="Colore del bollino" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(
                  [
                    ["light", "Per sfondi chiari"],
                    ["dark", "Per sfondi scuri"],
                  ] as const
                ).map(([theme, label]) => {
                  const active = badgeTheme === theme;
                  return (
                    <button
                      key={theme}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setBadgeTheme(theme)}
                      style={{
                        minHeight: 44,
                        padding: "0 16px",
                        borderRadius: 999,
                        border: `1px solid ${active ? brand.cianografiaPieno : brand.bordoCampo}`,
                        background: active ? brand.cianografiaPieno : brand.calce,
                        color: active ? "#FFFFFF" : brand.grafite,
                        fontSize: 15,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: 12,
                  borderRadius: 10,
                  background: badgeTheme === "dark" ? brand.grafite : brand.calce,
                  border: `1px solid ${brand.bordoCampo}`,
                  lineHeight: 0,
                }}
              >
                <a href={url} target="_blank" rel="noopener" style={{ display: "inline-block", lineHeight: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- lo stesso SVG che vedrà chi visita il sito del professionista */}
                  <img src={personalLinkBadgePath(link.code, badgeTheme)} alt={badgeAlt} width={220} height={64} />
                </a>
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 14, color: brand.grafite70 }}>Codice del bollino</span>
                <textarea
                  readOnly
                  style={{ ...fieldStyle, resize: "vertical", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 13, lineHeight: 1.45 }}
                  rows={4}
                  value={badgeHtml}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <Button alignSelf="flex-start" variant="secondary" onPress={() => void copy(badgeHtml, "badge")}>
                {copied === "badge" ? "Codice copiato" : "Copia il codice"}
              </Button>
            </Surface>

            <Surface gap="3">
              <Text render="h2" margin={0} fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                Porta un collega
              </Text>
              <Text color={brand.grafite70}>
                Conosci un professionista bravo, anche di un altro mestiere? Mandagli il tuo invito: vede come funziona il sito e si iscrive da lì.
              </Text>
              <Text
                fontSize={15}
                color={brand.grafite}
                backgroundColor={brand.gesso}
                borderWidth={1}
                borderColor={brand.filetto}
                borderRadius={10}
                paddingVertical="3"
                paddingHorizontal="4"
                style={{ overflowWrap: "anywhere" }}
              >
                {colleagueMessage}
              </Text>
              <XStack gap="2" flexWrap="wrap">
                <a href={`https://wa.me/?text=${encodeURIComponent(colleagueMessage)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <Button tabIndex={-1} variant="primary" icon={<Icon name="message-circle" size={18} color="white" />}>
                    Manda con WhatsApp
                  </Button>
                </a>
                {canShare ? (
                  <Button variant="secondary" icon={<Icon name="share-2" size={18} color={brand.grafite} />} onPress={() => void share(colleagueMessage)}>
                    Altro
                  </Button>
                ) : (
                  <Button variant="secondary" onPress={() => void copy(colleagueMessage, "colleague")}>
                    {copied === "colleague" ? "Messaggio copiato" : "Copia il messaggio"}
                  </Button>
                )}
              </XStack>
              <Text fontSize={14} color={brand.grafite70}>
                {link.colleaguesInvited === 0
                  ? "Ancora nessun collega iscritto con il tuo invito."
                  : `${link.colleaguesInvited === 1 ? "Un collega si è iscritto" : `${link.colleaguesInvited} colleghi si sono iscritti`} con il tuo invito. Grazie!`}
              </Text>
            </Surface>
          </>
        ) : null}
      </YStack>
    </YStack>
  );
}
