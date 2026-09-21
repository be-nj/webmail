# Sender Trust

How the webmail tells the reader who a message is from, and how far that claim can be believed. Fork-only (be-nj/webmail); not part of upstream.

## Language

Trust is judged on two separate axes: whether the message really comes from its domain and whether that domain is the brand it looks like (**Domain Trust**), and whether the reader trusts the exact address (**Sender Trust**).

### Domain Trust

**Sender Check**:
The delivering server's DMARC verdict for a message, read from the topmost Authentication-Results header only; it passes when that header says `dmarc=pass` for the From domain.
_Avoid_: Verification, authentication (unqualified), "verified sender"

**Freemail Domain**:
A domain that hands out mailboxes to anyone (web.de, gmx.de, gmail.com …), so the domain says nothing about who holds an address on it.
_Avoid_: Personal domain, consumer domain

**Verified Mark Certificate**:
A certificate (VMC) in which a mark authority ties a brand's logo to a domain; it proves the domain belongs to the brand owner, nothing about any single mailbox on it.
_Avoid_: "verified sender", blue check

**Brand Logo**:
The logo carried inside a domain's **Verified Mark Certificate**, used as the avatar for a message that passed its **Sender Check**, never for a **Freemail Domain**; its presence alone is the statement, it carries no badge.
_Avoid_: Verified logo, BIMI logo (a BIMI record without a certificate yields no **Brand Logo**), favicon

### Sender Trust

**Trusted Sender**:
An exact address the reader has personally marked as trusted, either in the local list or in the trusted-senders address book.
_Avoid_: Whitelisted sender, safe sender, known sender

**Trusted Mark**:
The handshake badge on an avatar (and the matching chip in the message's authentication details); it means the From address is a **Trusted Sender** and the message passed its **Sender Check**.
_Avoid_: Verified badge, check mark, blue check

**Impersonation Warning**:
The red warning shown when the From address is a **Trusted Sender** but the message failed its **Sender Check** (DMARC fail, or a hard SPF fail without a valid DKIM signature).
_Avoid_: Spoof alert, phishing warning (unqualified)

## Relationships

- **Domain Trust** and **Sender Trust** are independent: a **Brand Logo** says nothing about the person, a **Trusted Mark** nothing about the brand
- A **Brand Logo** requires a passed **Sender Check**, a valid **Verified Mark Certificate** naming the domain, and a domain that is not a **Freemail Domain**
- A **Brand Logo** is shared by every address on its domain
- A **Trusted Sender** on a given message shows exactly one of: the **Trusted Mark** (check passed), the **Impersonation Warning** (check failed), or neither (no verdict)
- A message without any Authentication-Results has no verdict: it can still load external content for a **Trusted Sender**, but never shows the **Trusted Mark**
- The **Impersonation Warning** shows in the message list and in the opened message

## Example dialogue

> **Dev:** "`MaxMusterI@web.de` passed DMARC — does it get a logo or a **Trusted Mark**?"
> **Domain expert:** "Neither. web.de is a **Freemail Domain**, so no **Brand Logo**, and only the exact address `Max.Musterl@web.de` is a **Trusted Sender** — trust doesn't carry over to a look-alike."
> **Dev:** "And `paypa1.de` publishing a BIMI record with PayPal's logo?"
> **Domain expert:** "No **Verified Mark Certificate** names paypa1.de, so no **Brand Logo**. Only the certificate ties a logo to the real owner."

## Flagged ambiguities

- The check badge first meant "the domain's **Verified Mark Certificate** checked out". Resolved: that is a statement about the domain and read as "this person is verified"; the badge is now the **Trusted Mark**, drawn as a handshake so it can't read as platform verification, and the **Brand Logo** carries no badge.
- "Logo" covered the favicon, a BIMI logo fetched from the record's URL, and the certificate's logo. Resolved: only the certificate's logo is a **Brand Logo**; the other two prove nothing about the domain and are not shown.
