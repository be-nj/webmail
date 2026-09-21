"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The Impersonation Warning (CONTEXT.md): a Trusted Sender's address is in
 * From, but the message failed its sender check. Shown above the message, in
 * the viewer and in each expanded thread card.
 */
export function ImpersonationWarning({ address }: { address: string }) {
  const t = useTranslations("email_viewer.impersonation_warning");
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-s-4 border-red-600 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p>{t("description", { address })}</p>
      </div>
    </div>
  );
}
