# Sender images only from verified marks

Fork-only (be-nj/webmail). An avatar image that stands for the sender's domain must be something only the real owner of that domain can put there. A favicon is whatever the From domain's website serves, so `beckm4nn.de` could serve PayPal's icon; a BIMI logo fetched from the record's `l=` URL is whatever the domain points at, so `paypa1.de` can publish PayPal's logo and pass DMARC for its own name. Only a Verified Mark Certificate ties a logo to the trademark owner. We therefore show a domain image only when the message passed its Sender Check and the domain is not a freemail domain, and then either the logo inside a VMC that chains to our own roots and names the domain, or — only when the From address is one of the reader's Trusted Senders — the picture the domain's BIMI record points at. The trusted case is safe for the same reason as the check: a look-alike cannot be a Trusted Sender that passes DMARC for the trusted address's own domain. Favicons are not shown at all.

## Considered Options

- **Keep favicons as fallback** — rejected: looks like verification, proves nothing.
- **Show certificate-less BIMI logos to everyone** — rejected: the same look-alike attack as the favicon, only with a nicer picture. Allowed for Trusted Senders only.
- **Mark verified logos with a badge** — rejected: a check next to a brand logo reads as "this person is verified", which is false on any domain with many mailboxes. The check badge now belongs to Trusted Senders only.

## Consequences

Senders whose mark authority's root we do not ship (Entrust) or who publish BIMI without a VMC get initials, unless the reader trusts that exact address. The upstream favicon route stays in the code base but is no longer used by the avatar, to keep rebases on upstream cheap.
