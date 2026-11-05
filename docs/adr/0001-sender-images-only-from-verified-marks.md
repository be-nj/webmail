# Sender images only from verified marks (superseded)

Status: superseded by upstream 1.18. Fork-only (be-nj/webmail).

Up to 1.17 the fork showed a domain image only for a message that passed its
Sender Check, for a non-freemail domain, with a Verified Mark Certificate
naming the domain, and dropped favicons and certificate-less BIMI logos. The
reasoning: a favicon is whatever the From domain's website serves, and a BIMI
logo fetched from a record's `l=` URL is whatever the domain points at, so
`paypa1.de` can publish PayPal's logo and pass DMARC for its own name.

Upstream 1.18 ships its own BIMI receiver (`/api/bimi`, `lib/bimi/`): DMARC
policy check, mark certificate validation, SVG checks, a check mark beside the
name for certificate-backed logos, an admin switch "Require a mark
certificate", and a favicon as the last avatar source. The fork took that over
as it is and keeps only the Sender Trust layer on top (Trusted Mark,
Impersonation Warning, marked senders). The look-alike risk above still
applies to DNS-only logos and favicons; the admin switch is the answer to it.
