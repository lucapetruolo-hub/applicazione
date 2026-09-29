"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * "Scopri di più" dell'avviso in cima alla chat (docs/CHANGELOG.md §166,
 * richiesta esplicita dell'utente, sul modello della pagina "Phishing" di
 * Subito.it): perché restare nella chat, come riconoscere una truffa, come
 * proteggersi e cosa fare. Solo cose vere per questo sito: i pagamenti dei
 * lavori oggi non passano dalla chat.
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap="$2">
      <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="$3" color={brand.grafite70} lineHeight={24}>
      {children}
    </Text>
  );
}

function Point({ n, title, children }: { n?: number; title: string; children: ReactNode }) {
  return (
    <YStack gap="$1" paddingLeft="$3" borderLeftWidth={3} borderLeftColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        {n !== undefined ? `${n}. ` : ""}
        {title}
      </Text>
      <P>{children}</P>
    </YStack>
  );
}

export function SicurezzaContent() {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={720} gap="$6">
        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite}>
            La tua sicurezza prima di tutto: resta nella chat
          </Text>
          <XStack gap="$3" padding="$4" borderRadius="$4" backgroundColor={brand.cianografiaVelo} alignItems="flex-start">
            <YStack flexShrink={0}>
              <Icon name="shield-check" size={22} color={brand.cianografia} strokeWidth={1.75} />
            </YStack>
            <Text fontSize="$3" color={brand.grafite} flex={1} lineHeight={24}>
              Attenzione a chi ti chiede di uscire dalla nostra chat. Qualsiasi scusa per spostarti su WhatsApp, Telegram o altre app (&quot;ti mando
              più foto&quot;, &quot;così facciamo prima&quot;, &quot;ti giro il preventivo lì&quot;) è un segnale d&apos;allarme. Nella chat resta una traccia di
              cosa vi siete detti, e se nasce un problema il nostro team può aiutarti.
            </Text>
          </XStack>
        </YStack>

        <Block title="Cos'è il phishing e come funziona">
          <P>
            Il phishing è una tecnica usata dai truffatori per ottenere informazioni personali, come password, dati di pagamento o codici di verifica. Arriva
            con messaggi, email o SMS che sembrano provenire da noi o da un cliente o professionista, ma sono falsi: contengono link a pagine contraffatte,
            QR code o allegati pensati per rubare i tuoi dati.
          </P>
        </Block>

        <Block title="Come riconoscere un tentativo di truffa">
          <Point n={1} title="Richieste di informazioni sensibili">
            Non ti chiederemo mai password, dati della carta, codici ricevuti via SMS o documenti tramite chat, email, SMS o telefono. Diffida di chiunque te
            li chieda, anche se dice di essere del nostro team.
          </Point>
          <Point n={2} title="Link e QR code">
            I messaggi truffa contengono spesso link o QR code che portano a pagine false, simili alle nostre. Prima di aprire un link controlla bene
            l&apos;indirizzo; nel dubbio non aprirlo. Non inquadrare mai un QR code ricevuto in chat.
          </Point>
          <Point n={3} title="Fretta, pressioni e errori">
            Richieste urgenti (&quot;paga entro un&apos;ora&quot;, &quot;conferma subito o perdi il lavoro&quot;), toni insoliti o errori di lingua sono
            segnali tipici di una truffa.
          </Point>
        </Block>

        <Block title="Come proteggerti">
          <Point n={1} title="Rimani nella nostra chat">
            Diffida di chi, già dai primi messaggi, ti chiede un contatto fuori dalla chat: email alternative, WhatsApp, Telegram, Signal o Messenger. I dati
            necessari per il lavoro (telefono, indirizzo) li mostriamo noi, solo quando il preventivo è accettato.
          </Point>
          <Point n={2} title="Non aprire link o allegati sospetti">
            Un finto cliente o un finto professionista può mandare un link o un PDF che sembra una ricevuta, una fattura o una conferma di pagamento, e
            chiederti di inserire i dati della carta per &quot;sbloccare&quot; o &quot;verificare&quot; il pagamento. È una truffa: non ti chiediamo mai di
            inserire dati di pagamento da un link ricevuto in chat.
          </Point>
          <Point n={3} title="Non condividere dati personali o della carta">
            Non inviare in chat numeri di carta, codici, documenti d&apos;identità o password. Se ti chiedono un anticipo tramite link, bonifico verso
            persone sconosciute o ricariche, fermati e segnalacelo.
          </Point>
          <Point n={4} title="Attenzione alle false telefonate e ai codici via SMS">
            Qualcuno potrebbe telefonarti fingendo di essere del nostro team, o chiederti di dettargli un codice arrivato via SMS: serve a rubarti
            l&apos;account. Non comunicare mai codici o password, a nessuno.
          </Point>
        </Block>

        <Block title="Cosa fare se sospetti una truffa">
          <Point title="Non cliccare sul link">È la precauzione più importante.</Point>
          <Point title="Non aprire allegati sospetti">Specialmente se ti chiedono di inserire dati per ricevere o fare un pagamento.</Point>
          <Point title="Non condividere informazioni sensibili">Mai dati personali o finanziari in risposta a richieste in chat, email o SMS.</Point>
          <Point title="Segnala l'utente">
            Usa &quot;Segnala&quot; sul profilo del professionista o, se sei un professionista, nel menu della richiesta. Oppure scrivici dalla pagina{" "}
            <Link href="/contatti" style={{ color: brand.cianografia, fontWeight: 700 }}>
              Contatti
            </Link>
            .
          </Point>
          <Point title="Se hai già inserito dei dati">
            Cambia subito la password dalle{" "}
            <Link href="/account" style={{ color: brand.cianografia, fontWeight: 700 }}>
              impostazioni dell&apos;account
            </Link>{" "}
            e, se hai inserito i dati della carta, chiama la tua banca per bloccarla.
          </Point>
          <Point title="Controlla le email">Guarda bene il mittente e l&apos;indirizzo dei link: nel dubbio non aprirli, entra dal sito scrivendo tu l&apos;indirizzo.</Point>
        </Block>
      </YStack>
    </YStack>
  );
}
