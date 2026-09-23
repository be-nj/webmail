# Fork-Notizen

Stand: 24.09.2026. Diese Datei gehört zum Fork `be-nj/webmail` und nicht nach
upstream (`bulwarkmail/webmail`). Sie beantwortet: *Was ist in diesem Fork
eigen?* und *Was ist noch offen?*

Die Begriffe rund um Absendervertrauen stehen in [CONTEXT.md](CONTEXT.md), die
Begründung für „Logos nur aus geprüften Marken, kein Favicon“ in
[docs/adr/0001](docs/adr/0001-sender-images-only-from-verified-marks.md).

---

## 1. Stand

Arbeitszweig: **`benj/on-1.10.0`** = Upstream-Tag `1.10.0` plus die Commits
unten. Live auf `webmail.beckm4nn.de` (Komodo-Stack `stalwart`, Dienst
`bulwark`), Image-Tag = kurzer Commit-Hash.

Der alte Zweig `fix/draft-recipient-roundtrip` (1.9.2) ist überholt. Sein
dritter Commit `6dcbd24f` (Suche beim Ordnerwechsel verlassen) ist durch die
upstream-Einstellung `clearSearchOnFolderChange` ersetzt, die hier
standardmäßig an ist.

## 2. Was der Fork gegenüber upstream enthält

| Commit | Was |
|---|---|
| `4105b027`, `5247b96e` | Empfänger-Fixes im Composer (keine kaputten Fragmente in Entwürfen, keine Nicht-Adressen) |
| `3b50e628` | deren Übersetzungen für `nb` und `zh-TW` |
| `2a7c7dca` | `clearSearchOnFolderChange` standardmäßig an |
| `520a9ba4` | Trusted Senders laden externe Inhalte nur, wenn die Nachricht nicht als gefälscht erkannt ist |
| `0ec72262`, `038059c4`, `56da4ba2` | BIMI: Route `/api/bimi`, DMARC nur aus dem obersten Authentication-Results, VMC/CMC-Prüfung gegen DigiCert/GlobalSign |
| `115f5ab3` | Logos nur aus geprüften Marken, nie für Freemail, **kein Favicon mehr**; Trusted-Sender-Badge und Warnung bei gefälschter vertrauter Adresse |
| `c2c044c4` | Pfad-Präfix-Bug: eine Ordner-ID wie `de` in `/mail/folder/de` galt als Mount-Präfix und legte Branding, Logos und JMAP lahm |
| `1693767b` | Handschlag statt Haken für Trusted Senders, Tooltip, Chip im Authentifizierungs-Block |
| `228e41c4` | BIMI-Logo ohne Zertifikat nur für Trusted Senders |
| `3315ebd5` | Versionsparameter gegen alte Browser-Cache-Antworten; vorübergehende VMC-Fehler nicht als „ungeprüft“ cachen |
| `3e1752e9` | Termin aus Mail erstellen: Betreff als Titel, Datum leer mit Fokus, Mail als Link und (bis 256 KB) als eingebettete `.eml` |

## 3. Wissenswertes

- **Stalwart schreibt** `dmarc=<result> header.from=<domain> policy.dmarc=…`
  (Crate `mail-auth`), die Ausrichtungsprüfung verlässt sich darauf.
- **Stalwart verwirft Termin-Anhänge per `blobId`**: Der Termin speichert, der
  Anhang ist weg, CalDAV liefert eine leere `ATTACH`-Zeile. `data:`-URIs und
  `href`-Links überleben. Deshalb die eingebettete `.eml`.
- **Entrust-Marken** (z. B. Lieferando) bleiben ungeprüft: Die Root ist nicht
  mitgeliefert, Apple misstraut Entrust-Zertifikaten ab 15.11.2024, und
  Lieferandos Zertifikat ist seit 12.09.2025 abgelaufen.
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
