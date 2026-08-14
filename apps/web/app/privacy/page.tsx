import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — OpenMatch",
  description:
    "A plain-language explanation of what the OpenMatch prototype stores and why.",
};

export default function PrivacyPage() {
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
        <a href="/support">Support</a>
      </nav>

      <article>
        <p className="landing-eyebrow">Prototype privacy notice</p>
        <h1>Your private life is not the product.</h1>
        <p className="document-lead">
          OpenMatch is an open-source prototype, not a public dating service.
          This notice describes the software and the current owner-only tailnet
          beta as of 12 August 2026. It is not a substitute for the controller
          identity, contact details, jurisdiction-specific notice, and legal
          review required before accepting public users.
        </p>

        <h2>What the prototype stores</h2>
        <p>
          If you use an account, the service stores your normalized email,
          protected passphrase verifier, confirmation and recovery-code
          verifiers, sessions, optional backup notification email, profile,
          preferences, consent receipts, introductions, decisions, saved
          profiles, connections, text messages, meeting-planning preference,
          blocks, and reports. The private demo uses one shared sample identity
          and dataset instead of an isolated personal account.
        </p>
        <p>
          Approximate city or region is self-entered. The prototype does not
          request GPS coordinates, contacts, legal name, employer, income,
          biometric data, read receipts, online status, advertising IDs, or
          message-content analytics.
        </p>

        <h2>Why it is stored</h2>
        <p>
          Data is used only to operate the requested account, calculate and
          explain mutually eligible introductions, preserve your choices, enable
          mutual text conversations, and provide safety and account controls.
          Matching is deterministic and uses the explicit inputs shown in the
          app. It does not optimize for time spent, advertising, payment, or
          predicted engagement.
        </p>

        <h2>Research is separate</h2>
        <p>
          Research participation defaults to off and has a separate, revocable
          consent. It does not affect matching. This prototype does not yet
          collect relationship outcomes, and opting in does not create
          permission for hidden experiments or message analysis.
        </p>

        <h2>Who can receive data</h2>
        <p>
          Eligible account users may receive the public profile fields needed
          for an introduction after separate directory consent and during a
          30-day availability window you explicitly start or renew. Expiry stops
          new introductions without creating login history or a public
          last-active time. The duration is an unvalidated prototype hypothesis.
          Public fields include your self-written gender description; OpenMatch
          never infers it. Your self-routing groups and the groups of people you
          are open to meeting both remain private matching inputs. A mutually
          interested person receives messages you deliberately send. The current
          host operator can technically access the Mac-hosted SQLite files and
          must be treated as a privileged administrator. No data is sold, used
          for advertising, or sent to data brokers.
        </p>
        <p>
          Expo/EAS processes application build data, GitHub hosts public source
          and documentation, Tailscale carries private beta traffic, and an SMTP
          provider would process account email if one is configured. SMTP is not
          configured in the current beta.
        </p>

        <h2>Retention and your controls</h2>
        <p>
          Sessions expire and can be revoked. You can pause or hide your
          profile, export the application data as JSON, withdraw research or
          directory consent, clear the private demo dataset, or delete an
          account from Profile. Local deletion is synchronous and removes the
          account credentials and isolated application store. The prototype
          labels each export with its schema, matching-method version, and
          creation time. On iOS and Android, OpenMatch creates the JSON file in
          its private cache for the system share sheet and attempts to delete
          that temporary copy whether sharing succeeds or fails. A destination
          app controls any copy you choose to save or send. Separately, choosing
          a profile photo uses the browser or system photo picker; OpenMatch
          compresses that selected image and stores it with the public profile.
          The prototype currently has no application-managed backups;
          infrastructure and third-party records require a reviewed retention
          and deletion policy before public launch.
        </p>

        <h2>Security and current limits</h2>
        <p>
          Network access uses HTTPS over a private tailnet. Credentials use
          salted scrypt verifiers, server sessions are stored as hashes, and
          native session tokens use device secure storage. The service is
          nevertheless hosted on one personal Mac without redundancy, encrypted
          backup, staffed incident response, penetration testing, or an
          independent security assessment. Do not enter real sensitive dating
          data into the private demo.
        </p>

        <h2>Inspect the exact inventory</h2>
        <p>
          The machine-readable inventory lists every current collection, field,
          purpose, retention rule, access role, and notable exclusion.
        </p>
        <div className="document-actions">
          <a href="https://github.com/jannis-cmd/openmatch/blob/main/docs/DATA_INVENTORY.json">
            Open the data inventory ↗
          </a>
          <a href="https://github.com/jannis-cmd/openmatch/blob/main/docs/PRIVACY_SECURITY.md">
            Read the security design ↗
          </a>
        </div>

        <h2>Questions or corrections</h2>
        <p>
          There is no staffed privacy office yet. Public GitHub issues are
          suitable only for non-sensitive documentation corrections. Never post
          personal account, dating, safety, or recovery information there. A
          private controller contact and response process remain mandatory
          before a public pilot.
        </p>
      </article>

      <footer className="document-footer">
        <a href="/">Home</a>
        <a href="/support">Support</a>
        <a href="/delete-account">Delete account</a>
        <a href="https://github.com/jannis-cmd/openmatch">Source</a>
      </footer>
    </main>
  );
}
