# Sender Trust

How the webmail tells the reader who a message is from, and how far that claim can be believed. Fork-only (be-nj/webmail); not part of upstream.

## Language

Trust is judged on two separate axes: whether the message really comes from its domain (**Domain Trust**, upstream's BIMI logo and Sender Check), and whether the reader trusts the exact address (**Sender Trust**, the fork's layer).

### Domain Trust

**Sender Check**:
The delivering server's DMARC verdict for a message, read from the topmost Authentication-Results header only; it passes when that header says `dmarc=pass` for the From domain.
_Avoid_: Verification, authentication (unqualified), "verified sender"

**Brand Logo**:
Upstream's BIMI logo (`/api/bimi`), shown as the avatar only for a message whose own Authentication-Results say `dmarc=pass` for the From domain. It says who the domain is, nothing about any single mailbox on it.
_Avoid_: Verified logo, "verified sender"

### Sender Trust

**Trusted Sender**:
An exact address the reader has personally marked as trusted: from a message that passed its **Sender Check**, or in Settings. Never set by replying or by allowing images.
_Avoid_: Whitelisted sender, safe sender, known sender

**Image Sender**:
An exact address whose external content loads without asking. "Always load images from this sender" and every reply add to it, so it says nothing about trust; upstream's code and settings call this list `trustedSenders`, and the trusted-senders address book holds it too.
_Avoid_: Trusted sender (for this list)

**Trusted Mark**:
The handshake badge on an avatar (and the matching chip in the message's authentication details); it means the From address is a **Trusted Sender** and the message passed its **Sender Check**.
_Avoid_: Verified badge, check mark, blue check

**Impersonation Warning**:
The red warning shown when the From address is a **Trusted Sender** but the message failed its **Sender Check** (DMARC fail, or a hard SPF fail without a valid DKIM signature) or passed neither SPF nor DKIM, so nothing ties it to the From domain. Separately, any message that fails the check loses an **Image Sender**'s right to load external content.
_Avoid_: Spoof alert, phishing warning (unqualified)

## Relationships

- An **Image Sender** is not a **Trusted Sender**: loading someone's images or replying to them never gives them the **Trusted Mark**
- **Domain Trust** and **Sender Trust** are independent: a **Brand Logo** says nothing about the person, a **Trusted Mark** nothing about the brand
- A **Brand Logo** is shared by every address on its domain
- A **Trusted Sender** on a given message shows exactly one of: the **Trusted Mark** (check passed), the **Impersonation Warning** (check failed), or neither (no verdict)
- A message without any Authentication-Results has no verdict: it can still load external content for an **Image Sender**, but never shows the **Trusted Mark**
- The **Impersonation Warning** shows in the message list and in the opened message

## Example dialogue

> **Dev:** "`MaxMusterI@web.de` passed DMARC — does it get a **Trusted Mark**?"
> **Domain expert:** "No. Only the exact address `Max.Musterl@web.de` is a **Trusted Sender**; trust doesn't carry over to a look-alike."

## Flagged ambiguities

- The check badge first meant "the domain's mark certificate checked out". Resolved: that read as "this person is verified"; the fork's badge is the **Trusted Mark**, drawn as a handshake so it can't read as platform verification. Upstream 1.18 draws its own check mark for certificate-backed logos, next to the name.
