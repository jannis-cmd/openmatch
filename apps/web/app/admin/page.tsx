"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { resolveWebApiConfiguration } from "../../lib/api-configuration.mjs";
import { LanguageSwitch, useLocale } from "../../lib/locale";

type Overview = {
  admin: { email: string; expiresAt: string };
  service: {
    status: "ok" | "degraded";
    algorithmVersion: string;
    deployedCommit: string | null;
  };
  accounts: { total: number; emailVerified: number; activeSessions: number };
  operations: {
    pendingAccountActions: number;
    pendingSecurityNotifications: number;
  };
  fixtures: { fictionalProfiles: number };
  privacy: Record<string, false>;
  generatedAt: string;
};

const copy = {
  de: {
    title: "Administration",
    subtitle: "Getrennter Zugang · nur aggregierte Betriebsdaten",
    email: "E-Mail",
    password: "Passwort",
    login: "Anmelden",
    loading: "Wird geladen …",
    invalid: "Anmeldung fehlgeschlagen.",
    logout: "Abmelden",
    status: "Dienststatus",
    algorithm: "Algorithmus",
    accounts: "Konten",
    verified: "Verifiziert",
    sessions: "Aktive Sitzungen",
    fixtures: "Fiktive Testprofile",
    pending: "Offene Zustellungen",
    privacy: "Datenschutzgrenze",
    privacyText:
      "Dieser Bereich zeigt keine Profile, Präferenzen, Nachrichten oder genauen Standorte.",
    expires: "Sitzung endet",
  },
  en: {
    title: "Administration",
    subtitle: "Separate access · aggregate operations only",
    email: "Email",
    password: "Password",
    login: "Sign in",
    loading: "Loading …",
    invalid: "Sign-in failed.",
    logout: "Sign out",
    status: "Service status",
    algorithm: "Algorithm",
    accounts: "Accounts",
    verified: "Verified",
    sessions: "Active sessions",
    fixtures: "Fictional test profiles",
    pending: "Pending deliveries",
    privacy: "Privacy boundary",
    privacyText:
      "This area exposes no profiles, preferences, messages, or precise locations.",
    expires: "Session ends",
  },
} as const;

const STORAGE_KEY = "openmatch-admin-session-v1";

export default function AdminPage() {
  const { locale } = useLocale();
  const t = copy[locale];
  const configuration = useMemo(
    () =>
      resolveWebApiConfiguration(
        process.env.NEXT_PUBLIC_OPENMATCH_API_URL,
        process.env.NODE_ENV === "development",
      ),
    [],
  );
  const [token, setToken] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [email, setEmail] = useState("admin@openmatch.local");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(configuration.error);

  const loadOverview = async (sessionToken: string) => {
    if (!configuration.url) return;
    const response = await fetch(`${configuration.url}/v1/admin/overview`, {
      headers: { authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("admin_session_required");
    setOverview((await response.json()) as Overview);
  };

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    setToken(saved);
    loadOverview(saved).catch(() => {
      sessionStorage.removeItem(STORAGE_KEY);
      setToken(null);
    });
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!configuration.url) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${configuration.url}/v1/admin/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("invalid_credentials");
      const session = (await response.json()) as { token: string };
      sessionStorage.setItem(STORAGE_KEY, session.token);
      setToken(session.token);
      setPassword("");
      await loadOverview(session.token);
    } catch {
      setError(t.invalid);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (token && configuration.url)
      await fetch(`${configuration.url}/v1/admin/session`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setOverview(null);
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a href="/">OpenMatch</a>
        <LanguageSwitch />
      </header>
      {!overview ? (
        <form className="admin-login" onSubmit={signIn}>
          <p className="eyebrow">OpenMatch</p>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          <label>
            {t.email}
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {t.password}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-action" disabled={busy}>
            {busy ? t.loading : t.login}
          </button>
        </form>
      ) : (
        <section className="admin-dashboard">
          <div className="admin-title">
            <div>
              <p className="eyebrow">{overview.admin.email}</p>
              <h1>{t.title}</h1>
              <p>
                {t.expires}:{" "}
                {new Date(overview.admin.expiresAt).toLocaleString(locale)}
              </p>
            </div>
            <button onClick={signOut}>{t.logout}</button>
          </div>
          <div className="admin-grid">
            <article>
              <span>{t.status}</span>
              <strong>{overview.service.status.toUpperCase()}</strong>
            </article>
            <article>
              <span>{t.accounts}</span>
              <strong>{overview.accounts.total}</strong>
            </article>
            <article>
              <span>{t.verified}</span>
              <strong>{overview.accounts.emailVerified}</strong>
            </article>
            <article>
              <span>{t.sessions}</span>
              <strong>{overview.accounts.activeSessions}</strong>
            </article>
            <article>
              <span>{t.fixtures}</span>
              <strong>{overview.fixtures.fictionalProfiles}</strong>
            </article>
            <article>
              <span>{t.pending}</span>
              <strong>
                {overview.operations.pendingAccountActions +
                  overview.operations.pendingSecurityNotifications}
              </strong>
            </article>
          </div>
          <article className="admin-privacy">
            <h2>{t.privacy}</h2>
            <p>{t.privacyText}</p>
            <small>
              {t.algorithm}: {overview.service.algorithmVersion}
            </small>
          </article>
        </section>
      )}
    </main>
  );
}
