import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete your account — WhyMatch",
  description:
    "Sign in to permanently delete a WhyMatch account and its associated prototype data.",
};

export default function DeleteAccountPage() {
  return (
    <main className="public-document">
      <nav className="document-nav" aria-label="Document navigation">
        <a className="landing-brand" href="/">
          <span className="openmatch-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          WhyMatch
        </a>
        <a href="/privacy">Privacy</a>
      </nav>

      <article>
        <p className="landing-eyebrow">Account deletion</p>
        <h1>Delete your account, not just hide it.</h1>
        <p className="document-lead">
          WhyMatch lets you permanently delete your complete account without
          contacting support. Sign in below and you will go directly to the
          deletion control in Profile.
        </p>

        <div className="document-actions document-primary-action">
          <a href="/#delete-account">Sign in to delete my account</a>
        </div>

        <h2>What happens</h2>
        <ul>
          <li>
            You re-enter the current password and confirm the irreversible
            action. A signed-in session alone is not enough.
          </li>
          <li>
            The service synchronously removes the account credential,
            confirmation and recovery-code verifiers, every session, and the
            isolated application database.
          </li>
          <li>
            Copies of your profile decisions, connection, and messages in
            another prototype account are erased before deletion is reported as
            complete.
          </li>
          <li>
            WhyMatch has no subscriptions, purchases, advertising account, or
            application-managed backup to cancel or retain.
          </li>
        </ul>

        <h2>If you cannot sign in</h2>
        <p>
          Use “Recover account” on the sign-in screen with one of the offline
          recovery codes you previously saved. Recovery replaces the password,
          invalidates every older session and recovery code, and then lets you
          return here. There is no staffed identity-recovery or
          deletion-by-email channel in this owner-only prototype.
        </p>

        <h2>Current service boundary</h2>
        <p>
          This URL is functional on the current private tailnet beta. It is not
          yet a public deletion URL for a store launch: WhyMatch still needs a
          publicly reachable service, accountable operator, private support
          contact, and reviewed legal retention policy before public
          registration.
        </p>
      </article>

      <footer className="document-footer">
        <a href="/">Home</a>
        <a href="/privacy">Privacy</a>
        <a href="/support">Support</a>
        <a href="https://github.com/jannis-cmd/openmatch">Source</a>
      </footer>
    </main>
  );
}
