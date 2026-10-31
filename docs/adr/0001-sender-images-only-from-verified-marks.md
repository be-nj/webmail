# Sender images only from verified marks

Fork-only (be-nj/webmail). An avatar image that stands for the sender's domain must be something only the real owner of that domain can put there. A favicon is whatever the From domain's website serves, so `beckm4nn.de` could serve PayPal's icon; a BIMI logo fetched from the record's `l=` URL is whatever the domain points at, so `paypa1.de` can publish PayPal's logo and pass DMARC for its own name. Only a Verified Mark Certificate ties a logo to the trademark owner. We therefore show a domain image only when the message passed its Sender Check, the domain is not a freemail domain, and a VMC chaining to our own roots names the domain — and then the logo inside the certificate. Favicons and certificate-less BIMI logos are not shown at all.

## Considered Options

- **Keep favicons as fallback** — rejected: looks like verification, proves nothing.
- **Show certificate-less BIMI logos without a badge** — rejected: the same look-alike attack as the favicon, only with a nicer picture.
- **Mark verified logos with a badge** — rejected: a check next to a brand logo reads as "this person is verified", which is false on any domain with many mailboxes. The check badge now belongs to Trusted Senders only.

## Consequences

Senders whose mark authority's root we do not ship (Entrust) or who publish BIMI without a VMC get initials, like any sender without a logo. The upstream favicon route stays in the code base but is no longer used by the avatar, to keep rebases on upstream cheap.
