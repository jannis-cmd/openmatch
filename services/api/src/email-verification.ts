import nodemailer from "nodemailer";

export type EmailVerificationMessage = {
  email: string;
  code: string;
  expiresAt: string;
};

export type EmailVerificationSender = (
  message: EmailVerificationMessage,
) => Promise<void>;

const SIMPLE_MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function smtpEmailVerificationSender(
  smtpUrl = process.env.OPENMATCH_SMTP_URL,
  from = process.env.OPENMATCH_EMAIL_FROM,
): EmailVerificationSender | null {
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
  return async ({ email, code, expiresAt }) => {
    await transport.sendMail({
      from,
      to: email,
      subject: "Confirm your OpenMatch email",
      text: [
        "Confirm that you can receive OpenMatch account messages.",
        "",
        `Confirmation code: ${code}`,
        `Expires: ${expiresAt}`,
        "",
        "If you did not create this account, you can ignore this message.",
        "OpenMatch will never ask you to send this code to another person.",
      ].join("\n"),
    });
  };
}
