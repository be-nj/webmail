"use client";

import { Download, ExternalLink, Mail, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CalendarLink } from "@/lib/jmap/types";

/**
 * How one of an event's links (JSCalendar `links`) can be offered:
 * - `download`: a `data:` URI - the bytes are in the event (e.g. a message
 *   attached by "create event from message"). Saved as a file, never opened as
 *   a page: a data: document is exactly what browsers refuse to navigate to.
 * - `internal`: an http(s) URL on this webmail's own origin, e.g. the link
 *   back to a message. Opened in place.
 * - `external`: any other http(s) URL. New tab, no referrer.
 * - `none`: any other scheme (javascript:, file:, …). Shown, not clickable.
 */
export type AttachmentKind = "download" | "internal" | "external" | "none";

export function attachmentKind(href: string, origin: string): AttachmentKind {
  if (/^data:[^,]*;base64,/i.test(href)) return "download";
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "none";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "none";
  return url.origin === origin ? "internal" : "external";
}

/** The bytes of a base64 `data:` URI as a Blob, or null when it doesn't decode. */
export function dataUriToBlob(href: string, fallbackType: string | null): Blob | null {
  const match = href.match(/^data:([^,;]*)(?:;[^,]*)?;base64,([\s\S]*)$/i);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1] || fallbackType || "application/octet-stream" });
  } catch {
    return null;
  }
}

function download(link: CalendarLink, fallbackName: string) {
  const blob = dataUriToBlob(link.href, link.contentType);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = link.title || fallbackName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * The event's attachments and links, as a list under its details. Renders
 * nothing when the event has none.
 */
export function EventAttachments({ links }: { links: Record<string, CalendarLink> | null | undefined }) {
  const t = useTranslations("calendar.attachments");
  const entries = links ? Object.entries(links) : [];
  if (entries.length === 0) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="flex items-start gap-2.5">
      <Paperclip className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden />
      <ul className="text-sm min-w-0 space-y-1" aria-label={t("title")}>
        {entries.map(([id, link]) => {
          const kind = attachmentKind(link.href, origin);
          const isMessage = link.contentType === "message/rfc822";
          const label = link.title || (kind === "download" ? t("file") : link.href);
          const Icon = kind === "download" ? Download : isMessage ? Mail : kind === "external" ? ExternalLink : Paperclip;
          const className = "inline-flex items-center gap-1.5 text-primary hover:underline max-w-full";
          return (
            <li key={id} className="min-w-0">
              {kind === "download" ? (
                <button type="button" onClick={() => download(link, t("file"))} className={className} title={t("download", { name: label })}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              ) : kind === "internal" ? (
                <a href={link.href} className={className} title={link.href}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </a>
              ) : kind === "external" ? (
                <a href={link.href} target="_blank" rel="noreferrer noopener" className={className} title={link.href}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground max-w-full" title={link.href}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
