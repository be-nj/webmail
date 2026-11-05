# Fork-Notizen

Stand: 05.11.2026. Diese Datei gehört zum Fork `be-nj/webmail` und nicht nach
upstream (`bulwarkmail/webmail`). Sie beantwortet: *Was ist in diesem Fork
eigen?* und *Was ist noch offen?*

Die Begriffe rund um Absendervertrauen stehen in [CONTEXT.md](CONTEXT.md). Die
alte Entscheidung „Logos nur aus geprüften Marken, kein Favicon“ ist seit
Upstream 1.18 überholt, siehe
[docs/adr/0001](docs/adr/0001-sender-images-only-from-verified-marks.md).

---

## 1. Stand

Arbeitszweig: **`benj/on-1.20.0`** = Upstream-Tag `1.20.0` plus die Commits
unten. Live auf `webmail.beckm4nn.de` (Komodo-Stack `stalwart`, Dienst
`bulwark`), Image-Tag = Commit-Hash.

Vorgänger (`benj/on-1.17.1`, `on-1.14.2`, ...) bleiben als Referenz liegen.

Beim Rebase auf 1.20.0 hat upstream mehrere Fork-Funktionen selbst
eingebaut; der Fork nimmt jeweils die Upstream-Fassung:

- **BIMI** (`/api/bimi`, `lib/bimi/`, Prüfung von VMC/CMC, Häkchen neben dem
  Namen, Admin-Schalter „Require a mark certificate“) und das **Favicon** als
  letzte Avatar-Quelle. Entfallen sind die eigenen BIMI-Commits samt „kein
  Favicon“ und „Logo ohne Zertifikat nur für Trusted Sender“. Der Fork legt
  nur die Trusted-Sender-Schicht darüber.
- **Anhänge als Karten unter dem Text** (Einstellung „Anhang-Position“,
  `below-message`). Die Mountain-View-eigenen Karten entfallen. Mountain
  View nimmt weiter den Standardwert der Einstellung.
- **Anhang-Chips in Listenzeilen** (`pinToFirstLine`, Chips unter dem
  Betreff) und **Suche mit offener Nachricht** (#1468).
- Geteilte Postfächer in Mountain View: upstream hat eigene Abschnitte
  (`renderSharedSection`, kompakte geteilte Postfächer). Der Fork zeigt sie
  nur zusätzlich ohne „Mehr“. Die eigene Zeile für das eigene Konto neben den
  geteilten Konten entfällt.

## 2. Was der Fork gegenüber upstream enthält

Die Hashes sind die ursprünglichen Commits; auf diesem Zweig tragen sie neue
Hashes mit derselben Betreffzeile.

| Commit | Was |
|---|---|
| `66851b5a` | Entwürfe speichern keine kaputten Empfängerfragmente und behalten Anzeigenamen |
| `3d9cc8ea` | `clearSearchOnFolderChange` standardmäßig an |
| `cc12c782` | Trusted Senders laden externe Inhalte nur, wenn die Nachricht nicht als gefälscht erkannt ist (auch für Bilder im zitierten Original) |
| (1.14.2) | Trusted Sender ohne SPF- und DKIM-Pass gilt als nicht vertraut und bekommt die Warnung |
| `da8f2f66`, `4ec28465` | Trusted-Sender-Badge (Handschlag im Herz) auf dem Avatar, Chip im Authentifizierungs-Block, Warnung bei gefälschter vertrauter Adresse; auch auf eingeklappten Nachrichten und in Listenzeilen in Mountain View |
| (1.17.1) | Trusted Sender nur per Hand markiert (Einstellungen, Nachricht), eigene Liste „Markierte Absender“ |
| `04b5c487` | Pfad-Präfix-Bug: eine Ordner-ID wie `de` in `/mail/folder/de` galt als Mount-Präfix |
| (1.14.2) | Mountain View: Suchfeld bündig mit der Inhaltskarte; Suche leeren schließt die offene Nachricht; „Mit Stern“ ist als aktiver Eintrag markiert; Archivieren der offenen Nachricht führt zurück zur Liste; Lese-Buttons der Auswahl nur aktiv, wenn sie etwas ändern |
| (1.14.2) | Mountain View: Einstellung „Listenzeilen“, Standard zweizeilig: Vorschau in eigener Zeile unter dem Betreff; einzeilig bleibt wie Gmail. Zweite Zeilen rücken in der vereinten Ansicht hinter den Konto-Punkt ein |
| (1.14.2) | Mountain View: Absender-Avatar in den Listenzeilen (zwischen Stern und Name) |
| (1.14.2) | Roboto als App-Schrift (selbst gehostet über `next/font`), statt System-Stack |
| (1.14.2) | Mountain View ist Standard-Layout für neue Nutzer und Geräte (gespeicherte oder synchronisierte Wahl bleibt) |
| (1.14.2) | Namenskürzel im Avatar: Nachname zuerst, Zahlen-Suffixe, Rechtsformen („GmbH & Co. KG“) |
| (1.14.2) | Senden von beliebigen Adressen einer Catch-all-Domain (Issue #1, braucht den Stalwart-Fork `stalwart-catchall` mit Capability `https://beckm4nn.net/jmap/catch-all-sender`): Reiter „Andere Adresse“ im Sub-Adress-Popover, Identität wird beim ersten Senden per `Identity/set` angelegt (Ablehnung bricht das Senden ab), Antworten gehen automatisch von der Catch-all-Adresse aus, an die die Mail ging. Adressen einer Gruppen-Catch-all-Domain (`bmn.email` → `mb@beck.ma`) gehen über das Gruppenkonto raus. Identitäten ohne Nutzung seit 30 Tagen stehen nicht mehr im From-Dropdown (synchronisierte Einstellung `catchAllSenders`). Ohne die Capability bleibt alles wie upstream |
| `07061e0d`, `9e1e569f` | Termin aus Mail erstellen (Eintrag „Termin erstellen“ im „Mehr“-Menü); Anhänge und Links eines Termins anzeigen |

In **Bulwark Lite** (statischer Build ohne Server) gibt es `/api/bimi` nicht;
upstream blendet dort Markenlogo und Favicon aus.

## 3. Wissenswertes

- **Stalwart schreibt** `dmarc=<result> header.from=<domain> policy.dmarc=…`
  (Crate `mail-auth`), die Ausrichtungsprüfung verlässt sich darauf.
- **Stalwart verwirft Termin-Anhänge per `blobId`**: Der Termin speichert, der
  Anhang ist weg, CalDAV liefert eine leere `ATTACH`-Zeile. `data:`-URIs und
  `href`-Links überleben. Deshalb die eingebettete `.eml`.
- **Upstream-Eigenheiten seit 1.12:** Orte in Terminen öffnen fest
  **Google Maps** (`lib/event-links.ts`, `mapsUrl`); Bestätigungscodes aus
  Mails erscheinen als Kopier-Chip auch in der Liste, auch bei Spam und
  Mails mit gescheiterter Prüfung (abschaltbar: „Show Verification Codes“).
- **Upstream-Absenderprüfung seit 1.13** (`getSenderVerification`): Hinweis
  „Absender nicht bestätigt“, wenn weder SPF noch DKIM bestehen, und
  „Absenderprüfung fehlgeschlagen“ bei DMARC-Fail. Der Fork nutzt sie für
  Trusted Senders mit (`failsSenderCheck`): Eine vertraute Adresse auf einer
  Nachricht ohne SPF- und DKIM-Pass bekommt die Impersonation-Warnung und
  lädt keine externen Inhalte. Ohne Authentication-Results bleibt das
  Vertrauen.
- **Neue Container ohne Volume** stehen im Setup-Modus (503 auf allen
  API-Routen). Für lokale Smoke-Tests `-e JMAP_SERVER_URL=https://mail.example.com`.

## 4. Offen

1. **Termin aus Mail in der echten App prüfen**, vor allem, ob Handy und
   Thunderbird den eingebetteten `.eml`-Anhang öffnen.
2. **Upstream, nur auf Nachfrage, nichts ungefragt öffentlich:**
   - Trusted-Senders-Fix als **private** Meldung an dev@bulwarkmail.org
     (CONTRIBUTING.md verlangt das für Sicherheitsthemen).
   - Pfad-Präfix-Bug als kleiner, eigener PR.
3. **Stalwart:** fehlende Unterstützung für Termin-Anhänge per `blobId` melden.
4. **Stalwart: fremde Authentication-Results bei angemeldeter Einlieferung.**
   Eine Mail, die ein Konto dieses Servers per Submission an ein anderes
   schickt, bekommt von Stalwart keinen eigenen Authentication-Results-Header,
   und ein mitgeschickter bleibt stehen (im Integrations-Stack geprüft am
   13.10.2026, auch mit dem echten Server-Namen als authserv-id). Der Client
   hält den obersten Header für den des Servers, also kann ein Kontoinhaber
   einen DMARC-Pass für fremde Domains vortäuschen (Marken-Logo, Handschlag).
   Ein Abgleich der authserv-id im Client hilft nicht. Abhilfe nur im
   Stalwart: auch bei Submission einen eigenen Header setzen oder fremde
   entfernen.

Deployed from `benj/on-1.20.0` (default branch on Forgejo).
