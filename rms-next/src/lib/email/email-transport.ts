/**
 * Pluggable email delivery.
 *
 * - **console** — logs only (no inbox). Default when `SMTP_HOST` is not set and `EMAIL_TRANSPORT` unset.
 * - **smtp** — real delivery via Nodemailer. Use when `EMAIL_TRANSPORT=smtp` OR `SMTP_HOST` is set.
 * - **webhook** — `EMAIL_TRANSPORT=webhook` + `EMAIL_WEBHOOK_URL`.
 *
 * **To (receiver):** e.g. `candidate_email` in the notification payload.
 * **From:** `EMAIL_FROM` / `NOTIFICATIONS_FROM`, else `DEFAULT_SENDER_FROM` below. Many providers require
 * the From domain/user to match your SMTP account.
 */
import nodemailer from "nodemailer";

const DEFAULT_SENDER_FROM = "tejas@rbmsoft.com";

export type OutboundEmail = {
  to: string;
  from?: string;
  subject: string;
  text: string;
  tags?: string[];
};

function defaultFromAddress(): string {
  const a =
    process.env.EMAIL_FROM?.trim() ||
    process.env.NOTIFICATIONS_FROM?.trim() ||
    DEFAULT_SENDER_FROM;
  return a.length > 0 ? a : DEFAULT_SENDER_FROM;
}

function resolveMode(): "console" | "webhook" | "smtp" {
  const raw = (process.env.EMAIL_TRANSPORT ?? "").toLowerCase().trim();
  if (raw === "webhook") return "webhook";
  if (raw === "smtp") return "smtp";
  if (raw === "console") return "console";
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  return "console";
}

/** True when mail can reach a real inbox (SMTP or HTTP webhook), not the dev console logger. */
export function isRealEmailConfigured(): boolean {
  const mode = resolveMode();
  if (mode === "smtp") {
    return Boolean(process.env.SMTP_HOST?.trim());
  }
  if (mode === "webhook") {
    const u = process.env.EMAIL_WEBHOOK_URL;
    return Boolean(u && u.startsWith("http"));
  }
  return false;
}

export async function sendViaSmtp(msg: OutboundEmail, from: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error("SMTP_HOST is not set (required for SMTP / real email delivery)");
  }
  const user =
    process.env.SMTP_USER?.trim() || process.env.SMTP_USERNAME?.trim() || undefined;
  let pass =
    process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim() || undefined;
  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_PASS (or SMTP_PASSWORD) are required for SMTP");
  }
  // Google App Passwords are shown with spaces; many .env parsers and copy/paste need them removed.
  const isLikelyGmail =
    /gmail|googlemail/i.test(host) || /@gmail\.com$|@googlemail\.com$/i.test(user);
  if (isLikelyGmail) {
    pass = pass.replace(/\s/g, "");
  }

  // Gmail: address in "From" must match the authenticated account (or a verified "Send mail as").
  const name = process.env.SMTP_FROM_NAME?.trim();
  const fromAddr = (() => {
    const explicit = process.env.EMAIL_FROM?.trim() || process.env.NOTIFICATIONS_FROM?.trim();
    const h = host.toLowerCase();
    if (h.includes("gmail") || h === "smtp.gmail.com") {
      return (explicit && explicit.length > 0 ? explicit : user) as string;
    }
    return (explicit && explicit.length > 0 ? explicit : from) as string;
  })();
  const fromField = name && name.length > 0 ? `${name} <${fromAddr}>` : fromAddr;

  const isGmailHost =
    host.toLowerCase() === "smtp.gmail.com" || host.toLowerCase().includes("gmail.com");

  const transporter = isGmailHost
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      })
    : (() => {
        const portRaw = process.env.SMTP_PORT?.trim() || "587";
        const port = Math.min(65535, Math.max(1, parseInt(portRaw, 10) || 587));
        const secure =
          process.env.SMTP_SECURE === "1" ||
          process.env.SMTP_SECURE === "true" ||
          port === 465;
        return nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
          requireTLS: !secure && port === 587,
        });
      })();

  let info: Awaited<ReturnType<typeof transporter.sendMail>>;
  try {
    info = await transporter.sendMail({
      from: fromField,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const extra =
      isGmailHost && /Application-specific password|Invalid login|535|534/i.test(m)
        ? " Use a Google *App Password* (Google Account → Security → 2-Step → App passwords), not your normal Gmail password."
        : "";
    throw new Error((m + extra).slice(0, 2000));
  }
  if (info.rejected && info.rejected.length > 0) {
    throw new Error(`SMTP rejected: ${String(info.rejected)}`);
  }
}

export async function sendOutboundEmail(msg: OutboundEmail): Promise<void> {
  const from = (msg.from ?? defaultFromAddress()).trim() || DEFAULT_SENDER_FROM;
  const mode = resolveMode();
  if (mode === "webhook") {
    const url = process.env.EMAIL_WEBHOOK_URL;
    if (!url || !url.startsWith("http")) {
      throw new Error("EMAIL_WEBHOOK_URL is not set or invalid for webhook mode");
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: msg.to,
        from,
        subject: msg.subject,
        text: msg.text,
        tags: msg.tags ?? [],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `Email webhook failed: ${res.status} ${t}`.slice(0, 500),
      );
    }
    return;
  }
  if (mode === "smtp") {
    await sendViaSmtp(msg, from);
    return;
  }
  // eslint-disable-next-line no-console -- dev default: no SMTP configured
  console.log(
    "[email:console] No real email sent. Set SMTP_HOST + SMTP_USER/SMTP_PASS (or EMAIL_TRANSPORT=smtp) to deliver to inboxes. Current mode: console",
    "\nFrom:",
    from,
    "\nTo:",
    msg.to,
    "\nSubject:",
    msg.subject,
    "\n---\n",
    msg.text,
    "\n---",
  );
}
