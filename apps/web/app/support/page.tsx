import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — OpenMatch",
  description:
    "Current OpenMatch prototype support, safety, and account-help information.",
};

export default function SupportPage() {
  return (
    <main className="public-document">
      <nav className="document-nav" aria-label="Document navigation">
        <a className="landing-brand" href="/">
          <span className="openmatch-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          OpenMatch
        </a>
        <a href="/privacy">Privacy</a>
      </nav>

      <article>
        <p className="landing-eyebrow">Prototype support</p>
        <h1>Help, without pretending we are ready.</h1>
        <p className="document-lead">
          OpenMatch is currently an owner-only prototype. There is no staffed
          customer-support or moderation team, no guaranteed response time, and
          no public registration. These are release blockers, not fine print.
        </p>

        <h2>Immediate safety in Switzerland</h2>
        <div className="document-callouts">
          <a href="tel:117">
            <strong>Police · 117</strong>
            <span>For immediate danger.</span>
          </a>
          <a href="tel:144">
            <strong>Medical emergency · 144</strong>
            <span>For urgent medical assistance.</span>
          </a>
          <a href="tel:142">
            <strong>Victim Support Switzerland · 142</strong>
            <span>
              Free, confidential, anonymous, 24/7 support. Not an emergency
              number.
            </span>
          </a>
        </div>
        <p>
          Elsewhere, use local emergency and victim-support services. Calls can
          remain visible in a device call history. OpenMatch receives no report
          or profile information when you use these links.
        </p>

        <h2>Account and app help</h2>
        <ul>
          <li>
            If the private beta cannot connect, confirm that the device is in
            the <code>cheetah-vernier</code> tailnet and that the host Mac is
            awake and online.
          </li>
          <li>
            Use Profile to inspect sessions, revoke another session, change the
            password, generate offline recovery codes, export data, or delete
            the account.
          </li>
          <li>
            Email confirmation and security-email delivery are unavailable while
            SMTP remains unconfigured. The app must display that state honestly.
          </li>
          <li>
            The shared private demo is not an account. Its sample data may be
            changed by another owner test session.
          </li>
        </ul>

        <h2>Report a software problem</h2>
        <p>
          Non-sensitive reproducible bugs and accessibility problems can be
          reported in the public source repository. Do not include names, email
          addresses, screenshots of profiles or conversations, session tokens,
          recovery codes, or details of abuse. Public GitHub is not a
          safety-reporting channel.
        </p>
        <div className="document-actions">
          <a href="https://github.com/jannis-cmd/openmatch/issues">
            Open GitHub issues ↗
          </a>
          <a href="https://github.com/jannis-cmd/openmatch/blob/main/docs/TAILNET_BETA.md">
            Read the beta runbook ↗
          </a>
        </div>

        <h2>Before real people can join</h2>
        <p>
          OpenMatch still needs a private support address, trained moderation
          and appeals, published response targets, incident handling,
          jurisdiction-specific emergency resources, and an accountable legal
          operator. Until those exist, this page documents a prototype rather
          than promising a service operation.
        </p>
      </article>

      <footer className="document-footer">
        <a href="/">Home</a>
        <a href="/privacy">Privacy</a>
        <a href="/delete-account">Delete account</a>
        <a href="https://github.com/jannis-cmd/openmatch">Source</a>
      </footer>
    </main>
  );
}
