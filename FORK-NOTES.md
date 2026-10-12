# Fork-Notizen

Stand: 12.10.2026. Diese Datei gehört zum Fork `be-nj/webmail` und nicht nach
upstream (`bulwarkmail/webmail`). Sie beantwortet: *Was ist in diesem Fork
eigen?* und *Was ist noch offen?*

Die Begriffe rund um Absendervertrauen stehen in [CONTEXT.md](CONTEXT.md), die
Begründung für „Logos nur aus geprüften Marken, kein Favicon“ in
[docs/adr/0001](docs/adr/0001-sender-images-only-from-verified-marks.md).

---

## 1. Stand

Arbeitszweig: **`benj/on-1.14.2`** = Upstream-Tag `1.14.2` plus die Commits
unten. Live auf `webmail.beckm4nn.de` (Komodo-Stack `stalwart`, Dienst
`bulwark`), Image-Tag = kurzer Commit-Hash.

Vorgänger `benj/on-1.12.0` und `benj/on-1.10.0` bleiben als Referenz liegen.
Beim Rebase auf 1.12.0 entfiel der eigene DMARC-Parser (`038059c4`): upstream
1.11.1 liest DMARC ebenfalls nur aus dem obersten Authentication-Results und
zusätzlich nur am Anfang eines Eintrags, was auch den `dmarc=pass` im
Envelope-Absender abfängt. Der Fork behält nur die Tests dazu.

Beim Rebase auf 1.14.2 entfielen die Empfängerprüfung im Composer
(`20f704d7`) und ihre `nb`/`zh-TW`-Übersetzungen (`db0b314e`): upstream 1.13
(`3efa370e`) behebt denselben Fehler (#795) auf eigene Art. Ungültige
Eingaben werden dort rote Chips statt im Feld zu bleiben, und Senden bricht
mit derselben Meldung ab. Übersetzt ist das in allen Sprachen.

## 2. Was der Fork gegenüber upstream enthält

Die Hashes sind die ursprünglichen Commits; auf diesem Zweig tragen sie neue
Hashes mit derselben Betreffzeile.

| Commit | Was |
|---|---|
| `66851b5a` | Entwürfe speichern keine kaputten Empfängerfragmente und behalten Anzeigenamen |
| `3d9cc8ea` | `clearSearchOnFolderChange` standardmäßig an |
| `cc12c782` | Trusted Senders laden externe Inhalte nur, wenn die Nachricht nicht als gefälscht erkannt ist |
| (1.14.2) | dieselbe Regel für Bilder im zitierten Original beim Antworten (neu in upstream 1.13) |
| (1.14.2) | Trusted Sender ohne SPF- und DKIM-Pass gilt als nicht vertraut und bekommt die Warnung |
| `087cfb41`, `98a4e553`, `4ce27dfe` | BIMI: Route `/api/bimi`, Auth-Header in Listenabfragen, Tests gegen gefälschte DMARC-Ergebnisse, VMC/CMC-Prüfung gegen DigiCert/GlobalSign |
| `da8f2f66` | Logos nur aus geprüften Marken, nie für Freemail, **kein Favicon**; Trusted-Sender-Badge und Warnung bei gefälschter vertrauter Adresse |
| `04b5c487` | Pfad-Präfix-Bug: eine Ordner-ID wie `de` in `/mail/folder/de` galt als Mount-Präfix |
| `4ec28465` | Handschlag-im-Herz statt Haken für Trusted Senders (Tabler hat keinen schlichten Handschlag), Tooltip, Chip im Authentifizierungs-Block |
| `fcc54961` | BIMI-Logo ohne Zertifikat nur für Trusted Senders |
| `4c9a0a4f` | Versionsparameter gegen alte Browser-Cache-Antworten; vorübergehende VMC-Fehler nicht als „ungeprüft“ cachen |
| (1.14.2) | BIMI-Logo und Trust-Badge auch auf den eingeklappten Nachrichten in Mountain View |
| (1.14.2) | Mountain View: Zeilen mit Anhang-Chips (Checkbox/Stern/Hover-Aktionen auf Zeile 1, Chips unter dem Betreff), Suchfeld bündig mit der Inhaltskarte, Handy-Avatar oben, keine Büroklammer neben den Chips (bei Threads nur, wenn allein ältere Nachrichten Anhänge haben) |
| (1.14.2) | Roboto als App-Schrift (selbst gehostet über `next/font`), statt System-Stack |
| (1.14.2) | Mountain View ist Standard-Layout für neue Nutzer und Geräte (gespeicherte oder synchronisierte Wahl bleibt). Die Admin-Policy kann das Layout nur sperren oder ausblenden, `policy.defaults` wird upstream nirgends angewendet |
| (1.14.2) | Mountain View: Anhänge der geöffneten Mail als Karten unter dem Text wie bei Gmail (Bildvorschau, Name, beim Hover Größe und Aktionen); die Einstellung „Anhang-Position“ gilt dort nicht mehr |
| (1.14.2) | Mountain View: Einstellung „Listenzeilen“ (Darstellung), Standard zweizeilig: Vorschau in eigener Zeile unter dem Betreff statt mit „-“ dahinter; einzeilig bleibt wie Gmail |
| (1.14.2) | Mountain View: „Mit Stern“ ist als aktiver Eintrag markiert, auch wenn er ohne „Alle mit Stern“-Ansicht nur eine Stern-Suche ist; ein Ordnerklick verlässt diese Suche immer |
| (1.14.2) | Mountain View: Absender-Avatar in den Listenzeilen (zwischen Stern und Name), damit BIMI-Logo und Vertrauens-Badge auch in der Liste stehen; Lese-Buttons der Auswahl nur aktiv, wenn sie etwas ändern |
| `07061e0d`, `9e1e569f` | Termin aus Mail erstellen; Anhänge und Links eines Termins anzeigen |

In **Bulwark Lite** (statischer Build ohne Server) gibt es `/api/bimi` nicht:
dort sind Markenlogo und Schalter ausgeblendet, wie upstream es mit dem Favicon
macht.

## 3. Wissenswertes

- **Stalwart schreibt** `dmarc=<result> header.from=<domain> policy.dmarc=…`
  (Crate `mail-auth`), die Ausrichtungsprüfung verlässt sich darauf.
- **Stalwart verwirft Termin-Anhänge per `blobId`**: Der Termin speichert, der
  Anhang ist weg, CalDAV liefert eine leere `ATTACH`-Zeile. `data:`-URIs und
  `href`-Links überleben. Deshalb die eingebettete `.eml`.
- **Entrust-Marken** (z. B. Lieferando) bleiben ungeprüft: Die Root ist nicht
  mitgeliefert, Apple misstraut Entrust-Zertifikaten ab 15.11.2024, und
  Lieferandos Zertifikat ist seit 12.09.2025 abgelaufen.
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
   - BIMI (#732) als PR, ohne die fork-eigenen Teile (Favicon-Entfernung,
     Trusted-Sender-Logo, Handschlag). Braucht Screenshots.
3. **Stalwart:** fehlende Unterstützung für Termin-Anhänge per `blobId` melden.
