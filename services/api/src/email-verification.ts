import nodemailer from "nodemailer";

export type EmailVerificationMessage = {
  email: string;
  code: string;
  expiresAt: string;
  purpose?:
    "account_confirmation" | "email_change_current" | "email_change_new";
};

export type EmailVerificationSender = (
  message: EmailVerificationMessage,
) => Promise<void>;

export type SecurityNotificationEvent =
  | "password_changed"
  | "recovery_codes_replaced"
  | "account_recovered"
  | "primary_email_changed"
  | "notification_address_added"
  | "notification_address_removed";

export type SecurityNotificationMessage = {
  email: string;
  event: SecurityNotificationEvent;
  occurredAt: string;
};

export type SecurityNotificationSender = (
  message: SecurityNotificationMessage,
) => Promise<void>;

export type AccountEmailSenders = {
  verification: EmailVerificationSender;
  security: SecurityNotificationSender;
};

const SIMPLE_MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function smtpAccountEmailSenders(
  smtpUrl = process.env.OPENMATCH_SMTP_URL,
  from = process.env.OPENMATCH_EMAIL_FROM,
): AccountEmailSenders | null {
  if (!smtpUrl && !from) return null;
  if (!smtpUrl || !from || !SIMPLE_MAILBOX.test(from))
    throw new RangeError(
      "OPENMATCH_SMTP_URL and a plain OPENMATCH_EMAIL_FROM mailbox are both required",
    );
  const parsed = new URL(smtpUrl);
  if (!["smtp:", "smtps:"].includes(parsed.protocol))
    throw new RangeError("OPENMATCH_SMTP_URL must use smtp: or smtps:");
  const transport = nodemailer.createTransport({
    url: smtpUrl,
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    requireTLS: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const send = (to: string, subject: string, lines: string[]) =>
    transport
      .sendMail({ from, to, subject, text: lines.join("\n") })
      .then(() => undefined);
  return {
    verification: ({
      email,
      code,
      expiresAt,
      purpose = "account_confirmation",
    }) =>
      send(
        email,
        purpose === "account_confirmation"
          ? "Confirm your OpenMatch email"
          : "Confirm your OpenMatch sign-in email change",
        [
          purpose === "email_change_current"
            ? "Confirm that you requested to replace this OpenMatch sign-in email."
            : purpose === "email_change_new"
              ? "Confirm this new OpenMatch sign-in email."
              : "Confirm that you can receive OpenMatch account messages.",
          "",
          `Confirmation code: ${code}`,
          `Expires: ${expiresAt}`,
          "",
          "If you did not create this account, you can ignore this message.",
          "OpenMatch will never ask you to send this code to another person.",
        ],
      ),
    security: ({ email, event, occurredAt }) => {
      const description = {
        password_changed: "Your OpenMatch password was changed.",
        recovery_codes_replaced:
          "A new set of OpenMatch recovery codes was created. Every older recovery code is now invalid.",
        account_recovered:
          "Your OpenMatch account was recovered with an offline recovery code. The password changed, every previous session ended, and every recovery code is now invalid.",
        primary_email_changed:
          "Your OpenMatch primary sign-in email was changed. Every other session was ended.",
        notification_address_added:
          "A confirmed backup notification email was added to your OpenMatch account.",
        notification_address_removed:
          "The backup notification email was removed from your OpenMatch account.",
      }[event];
      return send(email, "Security change to your OpenMatch account", [
        description,
        `Time: ${occurredAt}`,
        "",
        "This message contains no password, recovery code, device details, or sign-in link.",
        "If you did not make this change, open OpenMatch directly, change the password, replace recovery codes, and revoke sessions you do not recognize.",
        "This development service does not yet have a staffed account-takeover support channel.",
      ]);
    },
  };
}

export function smtpEmailVerificationSender(
  smtpUrl = process.env.OPENMATCH_SMTP_URL,
  from = process.env.OPENMATCH_EMAIL_FROM,
): EmailVerificationSender | null {
  return smtpAccountEmailSenders(smtpUrl, from)?.verification ?? null;
}
