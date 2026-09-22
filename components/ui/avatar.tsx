"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useContactStore, getContactPhotoUri } from "@/stores/contact-store";
import { useConfig } from "@/hooks/use-config";
import { avatarHooks } from "@/lib/plugin-hooks";
import { withBasePath } from "@/lib/browser-navigation";
import { AlertTriangle, Handshake } from "lucide-react";
import type { SenderTrustSignal } from "@/lib/sender-trust";

const IS_DEV = process.env.NODE_ENV !== "production";

// Known multi-part TLDs where the "main" domain includes one extra label.
// e.g. "newsletter.example.co.uk" → "example.co.uk", not "co.uk".
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "net.uk",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.kr", "or.kr", "go.kr", "ac.kr",
  "co.in", "net.in", "org.in", "ac.in", "gov.in",
  "co.nz", "org.nz", "net.nz", "govt.nz", "ac.nz",
  "co.za", "org.za", "net.za", "gov.za", "ac.za",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "com.br", "net.br", "org.br", "edu.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  "com.mx", "net.mx", "org.mx", "gob.mx", "edu.mx",
  "com.ar", "net.ar", "org.ar", "gob.ar", "edu.ar",
  "com.tw", "net.tw", "org.tw", "edu.tw", "gov.tw",
  "com.hk", "net.hk", "org.hk", "edu.hk", "gov.hk",
  "com.sg", "net.sg", "org.sg", "edu.sg", "gov.sg",
  "com.my", "net.my", "org.my", "edu.my", "gov.my",
  "com.ph", "net.ph", "org.ph", "edu.ph", "gov.ph",
  "com.pk", "net.pk", "org.pk", "edu.pk", "gov.pk",
  "com.ng", "net.ng", "org.ng", "edu.ng", "gov.ng",
  "co.il", "org.il", "net.il", "ac.il", "gov.il",
  "co.th", "or.th", "ac.th", "go.th", "in.th",
  "co.id", "or.id", "ac.id", "go.id", "web.id",
  "com.tr", "net.tr", "org.tr", "edu.tr", "gov.tr",
  "com.ua", "net.ua", "org.ua", "edu.ua", "gov.ua",
  "com.eg", "net.eg", "org.eg", "edu.eg", "gov.eg",
  "com.sa", "net.sa", "org.sa", "edu.sa", "gov.sa",
  "co.ke", "or.ke", "ac.ke", "go.ke", "ne.ke",
]);

/**
 * Extract the root/registrable domain from a full domain.
 * e.g. "newsletter.example.com" → "example.com"
 *      "mail.shop.example.co.uk" → "example.co.uk"
 *      "example.com" → "example.com"
 */
function getRootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;

  // Check if the last two parts form a known multi-part TLD
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    // Need at least 3 parts for a valid domain under a multi-part TLD
    return parts.length >= 3 ? parts.slice(-3).join(".") : domain;
  }

  // Standard TLD: take last two parts
  return parts.slice(-2).join(".");
}

// Brand Logos (CONTEXT.md) by exact From domain: one request per domain per
// page load, shared by every Avatar. `settledBrandLogos` holds the answers
// already in, so a row scrolled back into view draws its logo without a flash.
interface BrandLogo {
  /** data: URI of the SVG. */
  src: string;
  /**
   * From the domain's verified mark certificate. Otherwise it is the picture
   * the domain's BIMI record points at, which any domain can set to someone
   * else's logo - shown only for a Trusted Sender (docs/adr/0001).
   */
  verified: boolean;
}
const pendingBrandLogos = new Map<string, Promise<BrandLogo | null>>();
const settledBrandLogos = new Map<string, BrandLogo | null>();

function loadBrandLogo(domain: string): Promise<BrandLogo | null> {
  let pending = pendingBrandLogos.get(domain);
  if (!pending) {
    pending = fetch(withBasePath(`/api/bimi?domain=${encodeURIComponent(domain)}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { svg?: string | null; verified?: boolean } | null) =>
        data?.svg
          ? { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`, verified: data.verified === true }
          : null,
      )
      .catch(() => null)
      .then((logo) => {
        settledBrandLogos.set(domain, logo);
        return logo;
      });
    pendingBrandLogos.set(domain, pending);
  }
  return pending;
}

// Freemail domains: anyone can hold an address there, so the domain says
// nothing about the sender and never gets a Brand Logo.
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de",
  "live.com", "live.de", "msn.com", "yahoo.com", "yahoo.de", "yahoo.fr", "yahoo.co.uk", "yahoo.co.jp",
  "aol.com", "aol.de", "icloud.com", "me.com", "mac.com", "mail.com", "email.de",
  "proton.me", "protonmail.com", "pm.me", "tutanota.com", "tutanota.de", "tuta.com", "tuta.io",
  "zoho.com", "yandex.com", "yandex.ru", "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch",
  "web.de", "t-online.de", "freenet.de", "arcor.de", "online.de", "1und1.de", "vodafonemail.de",
  "fastmail.com", "hey.com", "posteo.de", "posteo.net", "mailbox.org", "magenta.de",
  "example.com", "example.org",
]);

// Deterministic hash for an email string
function emailHash(email: string): number {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Dev-only: common first names to infer gender for demo portrait selection
const FEMALE_NAMES: Set<string> = IS_DEV ? new Set([
  "alice", "emily", "sarah", "priya", "carol", "anna", "maria", "emma", "olivia",
  "sophia", "isabella", "mia", "charlotte", "amelia", "harper", "ella", "grace",
  "chloe", "luna", "lily", "zoey", "hannah", "nora", "riley", "elena", "maya",
  "claire", "victoria", "natalie", "rachel", "jessica", "jennifer", "lisa",
  "karen", "nancy", "betty", "sandra", "ashley", "margaret", "dorothy",
  "julia", "laura", "susan", "andrea", "diana", "marie", "sophie",
]) : new Set();

const MALE_NAMES: Set<string> = IS_DEV ? new Set([
  "bob", "marcus", "alex", "david", "james", "john", "robert", "michael",
  "william", "richard", "joseph", "thomas", "charles", "daniel", "matthew",
  "anthony", "mark", "steven", "paul", "andrew", "kevin", "brian", "george",
  "timothy", "jason", "ryan", "jacob", "gary", "eric", "peter", "frank",
  "samuel", "benjamin", "henry", "patrick", "jack", "noah", "liam", "oliver",
  "lucas", "ethan", "mason", "logan", "leo", "max", "oscar", "hugo",
]) : new Set();

function inferGender(name: string | undefined, hash: number): "women" | "men" {
  if (name) {
    const firstName = name.trim().split(/\s+/)[0].toLowerCase();
    if (FEMALE_NAMES.has(firstName)) return "women";
    if (MALE_NAMES.has(firstName)) return "men";
  }
  return hash % 2 === 0 ? "women" : "men";
}

// Dev-only: custom avatar URLs for specific demo senders
const CUSTOM_AVATARS: Record<string, string> = IS_DEV ? {
  "newsletter@launchweekly.com": "https://img.freepik.com/premium-vector/swoosh-letter-lw-logo-design-business-company-identity-water-wave-lw-logo-with-modern-trendy_754537-799.jpg?w=360",
  "hello@launchpad.example": "https://img.freepik.com/premium-vector/swoosh-letter-lw-logo-design-business-company-identity-water-wave-lw-logo-with-modern-trendy_754537-799.jpg?w=360",
  "news@techdigest.example": "https://img.freepik.com/premium-vector/technology-letter-t-logo-design-template_125964-1249.jpg?w=360",
  "alice@example.com": "https://randomuser.me/api/portraits/thumb/women/44.jpg",
  "bob@example.org": "https://randomuser.me/api/portraits/thumb/men/32.jpg",
  "carol@example.com": "https://randomuser.me/api/portraits/thumb/women/68.jpg",
} : {};

// Mock-server-only: for personal-domain emails, deterministically pick a randomuser.me portrait.
// Returns null for ~30% of addresses so not everyone has a photo.
function getProfilePictureUrl(email: string, domain: string, devMode: boolean, name?: string): string | null {
  if (!devMode) return null;
  if (!FREEMAIL_DOMAINS.has(domain)) return null;
  const h = emailHash(email);
  if (h % 10 < 3) return null; // ~30% get no photo
  const gender = inferGender(name, h);
  const id = h % 100;
  return `https://randomuser.me/api/portraits/thumb/${gender}/${id}.jpg`;
}

interface AvatarProps {
  name?: string;
  email?: string;
  contactPhotoUri?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, suppress all image sources (brand logos, plugin avatars, profile pics, contact photos) and render initials only. */
  disableImages?: boolean;
  /** When true, never show the domain's Brand Logo. Use for the user's own account avatar where the mail-provider logo is not meaningful. */
  disableFavicon?: boolean;
  /** Background color used when no image source resolves. Overrides the hash-based default. */
  fallbackColor?: string;
  /**
   * The message this avatar stands for passed DMARC for the domain of `email`
   * (see `hasAlignedDmarcPass`). Only then is the domain's Brand Logo asked
   * for: the logo vouches for the domain, so it must not appear on a message
   * that failed or skipped the check.
   */
  dmarcPass?: boolean;
  /**
   * What the message says about the sender as a Trusted Sender (see
   * `senderTrustSignal`): a handshake badge for `trusted`, a red warning badge for
   * `impersonated`.
   */
  senderTrust?: SenderTrustSignal;
  /** Tooltip for the sender-trust badge; the caller translates it. */
  senderTrustLabel?: string;
}

export function Avatar({ name, email, contactPhotoUri, size = "md", className, disableImages = false, disableFavicon = false, fallbackColor, dmarcPass = false, senderTrust = null, senderTrustLabel }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  // Start from what this page already knows, so a row scrolled back into view
  // draws its logo on the first render.
  const [brandLogo, setBrandLogo] = useState<BrandLogo | null | undefined>(() => {
    const d = email?.split("@")[1]?.toLowerCase();
    return d ? settledBrandLogos.get(d) : undefined;
  });
  const [brandLogoError, setBrandLogoError] = useState(false);
  const [pluginAvatarUrl, setPluginAvatarUrl] = useState<string | null>(null);
  const [pluginAvatarFailed, setPluginAvatarFailed] = useState(false);
  const senderBimiLogos = useSettingsStore((s) => s.senderBimiLogos);
  const contacts = useContactStore((s) => s.contacts);
  const { devMode } = useConfig();

  // Ask plugins (e.g. Gravatar) to resolve an avatar URL for this email address.
  // Runs whenever email or name changes; resets plugin avatar state on each change.
  useEffect(() => {
    setPluginAvatarUrl(null);
    setPluginAvatarFailed(false);
    if (!email || avatarHooks.onAvatarResolve.size === 0) return;
    let cancelled = false;
    avatarHooks.onAvatarResolve
      .transform(null as string | null, { email, name })
      .then((url) => { if (!cancelled) setPluginAvatarUrl(url); })
      .catch(() => { if (!cancelled) setPluginAvatarFailed(true); });
    return () => { cancelled = true; };
  }, [email, name]);

  // Look up contact photo by email from the contact store
  const resolvedContactPhoto = useMemo(() => {
    if (contactPhotoUri) return contactPhotoUri;
    if (!email) return undefined;
    const lowerEmail = email.toLowerCase();
    for (const contact of contacts) {
      if (!contact.emails) continue;
      for (const e of Object.values(contact.emails)) {
        if (e.address.toLowerCase() === lowerEmail) {
          return getContactPhotoUri(contact);
        }
      }
    }
    return undefined;
  }, [contactPhotoUri, email, contacts]);

  const domain = email?.split("@")[1]?.toLowerCase();
  // The registrable domain decides freemail (mail.gmx.net is still gmx.net).
  const rootDomain = domain ? getRootDomain(domain) : undefined;

  // Brand Logo: the logo in the domain's verified mark certificate, asked for
  // only for a message that passed DMARC for that domain, and never for a
  // freemail domain. There is no favicon fallback: an image the sender's own
  // website chooses proves nothing (docs/adr/0001).
  const wantBrandLogo =
    !disableImages && !disableFavicon && senderBimiLogos && dmarcPass && !!domain && !!rootDomain &&
    !FREEMAIL_DOMAINS.has(rootDomain);

  useEffect(() => {
    setBrandLogoError(false);
    if (!wantBrandLogo || !domain) {
      setBrandLogo(undefined);
      return;
    }
    if (settledBrandLogos.has(domain)) {
      setBrandLogo(settledBrandLogos.get(domain));
      return;
    }
    setBrandLogo(undefined);
    let cancelled = false;
    loadBrandLogo(domain).then((logo) => { if (!cancelled) setBrandLogo(logo); });
    return () => { cancelled = true; };
  }, [wantBrandLogo, domain]);

  const getInitials = () => {
    if (name) {
      const parts = name
        .trim()
        .split(/\s+/)
        .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ""))
        .filter((p) => p.length > 0);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "?";
  };

  const getBackgroundColor = () => {
    const str = name || email || "";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const profilePic = email && domain ? getProfilePictureUrl(email, domain, devMode, name) : null;
  // A certificate's logo for anyone who passed DMARC for the domain; the
  // record's own picture only when the reader trusts this exact address.
  const brandLogoSrc =
    wantBrandLogo && brandLogo && !brandLogoError && (brandLogo.verified || senderTrust === "trusted")
      ? brandLogo.src
      : null;

  // Priority: contact photo > plugin avatar (e.g. Gravatar) > custom avatar > profile picture > Brand Logo > initials
  const customAvatar = devMode && email ? CUSTOM_AVATARS[email.toLowerCase()] : null;
  const pluginAvatar = pluginAvatarFailed ? null : pluginAvatarUrl;
  const photoSrc = imgError ? null : (resolvedContactPhoto || pluginAvatar || customAvatar || profilePic || null);
  const imgSrc = disableImages ? null : (photoSrc || brandLogoSrc);
  const isBrandLogo = imgSrc !== null && imgSrc === brandLogoSrc;
  // Badges sit on the edge, so the circle must not clip them; the image clips itself.
  const badge = senderTrust === "impersonated" || senderTrust === "trusted" ? senderTrust : null;

  const handleImgError = useCallback(() => {
    // If the plugin avatar just failed, mark it and fall through to the next source
    if (pluginAvatar && imgSrc === pluginAvatar) {
      setPluginAvatarFailed(true);
      return;
    }
    if (brandLogoSrc && imgSrc === brandLogoSrc) {
      setBrandLogoError(true);
      return;
    }
    setImgError(true);
  }, [imgSrc, pluginAvatar, brandLogoSrc]);

  return (
    <div
      className={cn(
        "relative rounded-full flex items-center justify-center font-semibold text-white",
        !badge && "overflow-hidden",
        badge === "impersonated" && "ring-2 ring-red-600 dark:ring-red-500",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: imgSrc ? (isBrandLogo ? "#ffffff" : "transparent") : (fallbackColor ?? getBackgroundColor()) }}
      title={name || email}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="w-full h-full object-cover rounded-full"
          onError={handleImgError}
        />
      ) : (
        getInitials()
      )}
      {badge && (
        // Trusted: the reader trusts this exact address and the message passed
        // its sender check - a handshake, not a check mark, so it can't read
        // as "verified by the platform". Impersonated: a trusted address in
        // From, but the message failed its check.
        <span
          role="img"
          aria-label={senderTrustLabel}
          title={senderTrustLabel}
          data-testid={badge === "trusted" ? "trusted-mark" : "impersonation-mark"}
          className={cn(
            "absolute -bottom-0.5 -end-0.5 w-[46%] h-[46%] rounded-full flex items-center justify-center ring-2 ring-background",
            badge === "trusted" ? "bg-primary text-primary-foreground" : "bg-red-600 text-white",
          )}
        >
          {badge === "trusted"
            ? <Handshake aria-hidden className="w-[72%] h-[72%]" strokeWidth={2.25} />
            : <AlertTriangle aria-hidden className="w-[66%] h-[66%]" strokeWidth={2.5} />}
        </span>
      )}
    </div>
  );
}
