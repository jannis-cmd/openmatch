"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveWebApiConfiguration } from "../lib/api-configuration.mjs";
import {
  clearPendingMessageAttempts,
  persistPendingMessageAttempts,
  restorePendingMessageAttempts,
} from "../lib/pending-message-attempts.mjs";
import {
  ApiError,
  createApiClient,
  type AccountStatus,
  type AccountDeliveryStatus,
  type AccountSession,
  type Connection,
  type DeletionReceipt,
  type DeliverySettings,
  type DirectoryConsentReceipt,
  type EmailVerificationStatus,
  type Message,
  type NotificationEmailStatus,
  type ReportRecord,
  type ReportReason,
  type ReportUpdateKind,
  type ResearchConsentReceipt,
  type SecurityNotificationStatus,
  type SecurityNotificationDeliveryStatus,
  type TransparencyVersion,
} from "@openmatch/api-client";
import {
  ALGORITHM_VERSION,
  defaultPreferences,
  demoUser,
  explainMatch,
  messageSafetyFlags,
  nearestPriority,
  POLITE_CLOSE_MESSAGE,
  conversationStarter,
  GENDER_DISCOVERY_GROUPS,
  PRIORITY_LEVELS,
  priorityLabel,
  type Introduction,
  type GenderDiscoveryGroup,
  type Preferences,
  type Profile,
  type WeightSuggestion,
} from "@openmatch/matching";

type View = "today" | "connections" | "preferences" | "profile" | "about";
type SiteView = "landing" | "sign-in" | "app";

const operationLimitMessage = (error: unknown, fallback: string) => {
  if (
    !(error instanceof ApiError) ||
    error.code !== "operation_rate_limit_exceeded"
  )
    return fallback;
  const wait = error.retryAfterSeconds
    ? ` Try again in about ${error.retryAfterSeconds} seconds.`
    : " Try again after the short waiting period.";
  return `This action is temporarily limited to protect people and the service.${wait}`;
};

export default function Home() {
  const demoConfiguration = useMemo(
    () =>
      resolveWebApiConfiguration(
        process.env.NEXT_PUBLIC_OPENMATCH_API_URL,
        process.env.NODE_ENV === "development",
      ),
    [],
  );
  const [siteView, setSiteView] = useState<SiteView>("landing");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [accountEntryNotice, setAccountEntryNotice] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const storedToken = window.sessionStorage.getItem("openmatch-auth-token");
    const storedDemo = window.sessionStorage.getItem("openmatch-demo-session");
    if (demoConfiguration.url && storedToken) {
      setAuthToken(storedToken);
      setSiteView("app");
    } else if (demoConfiguration.url && storedDemo === "active") {
      setSiteView("app");
    } else if (!demoConfiguration.url && (storedDemo || storedToken)) {
      window.sessionStorage.removeItem("openmatch-demo-session");
      window.sessionStorage.removeItem("openmatch-auth-token");
    }
  }, [demoConfiguration.url]);

  const openApp = () => {
    if (!demoConfiguration.url) return;
    clearPendingMessageAttempts(window.sessionStorage);
    window.sessionStorage.setItem("openmatch-demo-session", "active");
    setSiteView("app");
  };

  const exitApp = () => {
    clearPendingMessageAttempts(window.sessionStorage);
    window.sessionStorage.removeItem("openmatch-demo-session");
    window.sessionStorage.removeItem("openmatch-auth-token");
    setAuthToken(null);
    setAccountEntryNotice(null);
    setSiteView("landing");
  };
  const endAccountSession = () => {
    clearPendingMessageAttempts(window.sessionStorage);
    window.sessionStorage.removeItem("openmatch-demo-session");
    window.sessionStorage.removeItem("openmatch-auth-token");
    setAuthToken(null);
    setAccountEntryNotice("Your session ended. Sign in again.");
    setSiteView("sign-in");
  };

  const openAuthenticatedApp = (
    token: string,
    notification?: SecurityNotificationStatus,
  ) => {
    clearPendingMessageAttempts(window.sessionStorage);
    window.sessionStorage.removeItem("openmatch-demo-session");
    window.sessionStorage.setItem("openmatch-auth-token", token);
    setAuthToken(token);
    setAccountEntryNotice(
      notification
        ? "Account recovered. Every previous session and recovery code was invalidated." +
            securityNotice(notification)
        : null,
    );
    setSiteView("app");
  };

  if (siteView === "landing") {
    return (
      <LandingPage
        signIn={() => setSiteView("sign-in")}
        tryDemo={openApp}
        demoError={demoConfiguration.error}
      />
    );
  }

  if (siteView === "sign-in") {
    return (
      <SignInPage
        back={() => setSiteView("landing")}
        apiUrl={demoConfiguration.url}
        continueToApp={openAuthenticatedApp}
        demoError={demoConfiguration.error}
        entryNotice={accountEntryNotice}
      />
    );
  }

  return demoConfiguration.url ? (
    <AppExperience
      exit={exitApp}
      sessionEnded={endAccountSession}
      apiUrl={demoConfiguration.url}
      authToken={authToken}
      accountEntryNotice={accountEntryNotice}
    />
  ) : (
    <LandingPage
      signIn={() => setSiteView("sign-in")}
      tryDemo={openApp}
      demoError={demoConfiguration.error}
    />
  );
}

function AppExperience({
  exit,
  sessionEnded,
  apiUrl,
  authToken,
  accountEntryNotice,
}: {
  exit: () => void;
  sessionEnded: () => void;
  apiUrl: string;
  authToken: string | null;
  accountEntryNotice: string | null;
}) {
  const api = useMemo(
    () =>
      createApiClient(apiUrl, fetch, {
        initialToken: authToken,
        demoSessions: !authToken,
        client: "web",
        onTokenChange: (token) => {
          if (token)
            window.sessionStorage.setItem("openmatch-auth-token", token);
          else {
            window.sessionStorage.removeItem("openmatch-auth-token");
          }
        },
        onSessionInvalidated: sessionEnded,
      }),
    [apiUrl, authToken, sessionEnded],
  );
  const [view, setView] = useState<View>("today");
  const [preferences, setPreferences] = useState<Preferences>(
    structuredClone(defaultPreferences),
  );
  const [profile, setProfile] = useState<Profile>(demoUser);
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [nextBatchAt, setNextBatchAt] = useState<string | null>(null);
  const [savedIntroductions, setSavedIntroductions] = useState<Introduction[]>(
    [],
  );
  const [showSaved, setShowSaved] = useState(false);
  const [details, setDetails] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationDrafts, setConversationDrafts] = useState<
    Record<string, string>
  >({});
  const [pendingMessageAttempts, setPendingMessageAttempts] = useState<
    Record<string, { text: string; requestId: string }>
  >({});
  const [messageAttemptsRestored, setMessageAttemptsRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [researchConsent, setResearchConsent] =
    useState<ResearchConsentReceipt | null>(null);
  const [directoryConsent, setDirectoryConsent] =
    useState<DirectoryConsentReceipt | null>(null);
  const [suggestions, setSuggestions] = useState<WeightSuggestion[]>([]);
  const [preferenceObservationCount, setPreferenceObservationCount] =
    useState(0);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active");
  const [accountDeliveryStatus, setAccountDeliveryStatus] =
    useState<AccountDeliveryStatus | null>(null);
  const [securityNotificationDelivery, setSecurityNotificationDelivery] =
    useState<SecurityNotificationDeliveryStatus | null>(null);
  const [accountSessions, setAccountSessions] = useState<AccountSession[]>([]);
  const [emailVerification, setEmailVerification] =
    useState<EmailVerificationStatus | null>(null);
  const [notificationEmail, setNotificationEmail] =
    useState<NotificationEmailStatus | null>(null);
  const [delivery, setDelivery] = useState<DeliverySettings>({ batchSize: 5 });
  const [deletionReceipt, setDeletionReceipt] =
    useState<DeletionReceipt | null>(null);
  const [transparency, setTransparency] = useState<TransparencyVersion | null>(
    null,
  );
  const visibleIntroductions = showSaved ? savedIntroductions : introductions;
  const current = visibleIntroductions[0];
  const connected = connections.length > 0;
  const selectedConnection =
    connections.find(({ id }) => id === selectedConnectionId) ?? connections[0];
  const draft = selectedConnection
    ? (conversationDrafts[selectedConnection.id] ?? "")
    : "";
  const pendingMessageAttempt = selectedConnection
    ? pendingMessageAttempts[selectedConnection.id]
    : undefined;
  const setDraft = (value: string) => {
    if (!selectedConnection) return;
    setConversationDrafts((current) => ({
      ...current,
      [selectedConnection.id]: value,
    }));
  };
  useEffect(() => {
    const restored = restorePendingMessageAttempts(
      window.sessionStorage,
    ) as Record<string, { text: string; requestId: string }>;
    setPendingMessageAttempts(restored);
    setConversationDrafts((current) => ({
      ...Object.fromEntries(
        Object.entries(restored).map(([id, attempt]) => [id, attempt.text]),
      ),
      ...current,
    }));
    setMessageAttemptsRestored(true);
  }, []);
  useEffect(() => {
    if (!messageAttemptsRestored) return;
    persistPendingMessageAttempts(
      window.sessionStorage,
      pendingMessageAttempts,
    );
  }, [messageAttemptsRestored, pendingMessageAttempts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        nextProfile,
        nextPreferences,
        nextIntroductions,
        nextSavedIntroductions,
        nextConnections,
        onboarding,
        nextSuggestions,
        nextAccountStatus,
        nextDelivery,
        nextTransparency,
        nextReports,
        nextResearchConsent,
        nextAccountSessions,
        nextDirectoryConsent,
        nextEmailVerification,
        nextNotificationEmail,
        nextAccountDeliveryStatus,
        nextSecurityNotificationDelivery,
      ] = await Promise.all([
        api.profile(),
        api.preferences(),
        api.introductions(),
        api.savedIntroductions(),
        api.connections(),
        api.onboarding(),
        api.preferenceSuggestions(),
        api.accountStatus(),
        api.deliverySettings(),
        api.transparencyVersion(),
        api.reports(),
        api.researchConsent(),
        api.sessions(),
        api.directoryConsent(),
        authToken ? api.emailVerification() : Promise.resolve(null),
        authToken ? api.notificationEmail() : Promise.resolve(null),
        api.accountDeliveryStatus(),
        authToken ? api.securityNotificationStatus() : Promise.resolve(null),
      ]);
      setProfile(nextProfile);
      setPreferences(nextPreferences);
      setIntroductions(nextIntroductions.items);
      setNextBatchAt(nextIntroductions.nextBatchAt);
      setSavedIntroductions(nextSavedIntroductions.items);
      setConnections(nextConnections.items);
      setOnboarded(onboarding.complete);
      setSuggestions(nextSuggestions.items);
      setPreferenceObservationCount(nextSuggestions.observationCount);
      setAccountStatus(nextAccountStatus.status);
      setDelivery(nextDelivery);
      setTransparency(nextTransparency);
      setReports(nextReports.items);
      setResearchConsent(nextResearchConsent.receipt);
      setAccountSessions(nextAccountSessions.items);
      setDirectoryConsent(nextDirectoryConsent.receipt);
      setEmailVerification(nextEmailVerification);
      setNotificationEmail(nextNotificationEmail);
      setAccountDeliveryStatus(nextAccountDeliveryStatus);
      setSecurityNotificationDelivery(nextSecurityNotificationDelivery);
    } catch {
      setError(
        "OpenMatch could not reach its configured service. Check your connection and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    if (loading || !messageAttemptsRestored) return;
    const activeIds = new Set(connections.map(({ id }) => id));
    setConversationDrafts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => activeIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
    setPendingMessageAttempts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => activeIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [connections, loading, messageAttemptsRestored]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    let requestRunning = false;
    const synchronize = async () => {
      if (requestRunning || document.visibilityState === "hidden") return;
      requestRunning = true;
      try {
        const { items } = await api.connections();
        if (active) setConnections(items);
      } catch {
        // The full load path owns visible connection errors. Background
        // reconciliation stays quiet and tries again only while visible.
      } finally {
        requestRunning = false;
      }
    };
    const timer = window.setInterval(() => void synchronize(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api]);
  useEffect(() => {
    if (
      accountDeliveryStatus?.state !== "retrying" &&
      securityNotificationDelivery?.state !== "retrying"
    )
      return;
    const timer = window.setInterval(() => {
      if (accountDeliveryStatus?.state === "retrying")
        void api
          .accountDeliveryStatus()
          .then(setAccountDeliveryStatus)
          .catch(() => undefined);
      if (authToken && securityNotificationDelivery?.state === "retrying")
        void api
          .securityNotificationStatus()
          .then(setSecurityNotificationDelivery)
          .catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [
    accountDeliveryStatus?.state,
    api,
    authToken,
    securityNotificationDelivery?.state,
  ]);
  useEffect(() => {
    let active = true;
    setMessages([]);
    if (!selectedConnection) {
      setSelectedConnectionId(null);
      return () => {
        active = false;
      };
    }
    setSelectedConnectionId(selectedConnection.id);
    let requestRunning = false;
    const synchronize = async (showError: boolean) => {
      if (requestRunning || document.visibilityState === "hidden") return;
      requestRunning = true;
      try {
        const { items } = await api.messages(selectedConnection.id);
        if (active) setMessages(items);
      } catch {
        if (active && showError) setError("Messages could not be loaded.");
      } finally {
        requestRunning = false;
      }
    };
    void synchronize(true);
    const timer = window.setInterval(() => void synchronize(false), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, selectedConnection?.id]);
  const savePreferences = async (next: Preferences) => {
    setPreferences(next);
    try {
      await api.updatePreferences(next);
      setIntroductions((await api.introductions()).items);
      const nextSuggestions = await api.preferenceSuggestions();
      setSuggestions(nextSuggestions.items);
      setPreferenceObservationCount(nextSuggestions.observationCount);
    } catch {
      setError("Preferences could not be saved.");
    }
  };

  const handleDeliveryFailure = async (error: unknown, fallback: string) => {
    if (
      error instanceof ApiError &&
      error.code === "account_delivery_incomplete"
    ) {
      setError(null);
      setNotice(
        "This action is safely queued, but delivery is not complete. Do not assume the other person received it yet.",
      );
      try {
        setAccountDeliveryStatus(await api.accountDeliveryStatus());
      } catch {
        // Preserve the explicit queued-delivery notice when status refresh also
        // fails; the unchanged action can still be retried safely.
      }
      return true;
    }
    setError(operationLimitMessage(error, fallback));
    return false;
  };
  const synchronizeSecurityNotification = async (
    status: SecurityNotificationStatus,
  ) => {
    try {
      setSecurityNotificationDelivery(await api.securityNotificationStatus());
    } catch {
      // The operation response still states whether the immediate attempt
      // succeeded. A later load can recover durable queue status.
    }
    return status;
  };

  const runCrossAccountAction = async (
    action: () => Promise<unknown>,
    fallback: string,
  ) => {
    try {
      await action();
      await load();
    } catch (error) {
      await handleDeliveryFailure(error, fallback);
    }
  };

  const decide = async (decision: "interested" | "passed") => {
    if (!current) return;
    try {
      await api.decide(current.profile.id, decision);
      setDetails(false);
      setShowSaved(false);
      await load();
    } catch (error) {
      await handleDeliveryFailure(
        error,
        "Your decision could not be saved. Please retry.",
      );
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (authToken) void api.signOut().finally(exit);
            else exit();
          }}
          aria-label="OpenMatch home"
        >
          OpenMatch
        </button>
        <span className="nonprofit">Nonprofit · Open source</span>
      </header>
      <div className={`workspace ${onboarded ? "" : "workspace-single"}`}>
        {onboarded && (
          <aside className="sidebar" aria-label="Primary navigation">
            <Nav
              active={view === "today"}
              onClick={() => setView("today")}
              label="Today"
            />
            <Nav
              active={view === "connections"}
              onClick={() => setView("connections")}
              label={`Connections${connected ? ` · ${connections.length}` : ""}`}
            />
            <Nav
              active={view === "preferences"}
              onClick={() => setView("preferences")}
              label="Preferences"
            />
            <Nav
              active={view === "profile"}
              onClick={() => setView("profile")}
              label="Your profile"
            />
            <Nav
              active={view === "about"}
              onClick={() => setView("about")}
              label="How it works"
            />
            <p className="side-note">
              No ads
              <br />
              No premium ranking
              <br />
              No infinite feed
            </p>
          </aside>
        )}
        <section className="content">
          {accountDeliveryStatus?.state === "retrying" && (
            <div className="account-status" role="status">
              <strong>Delivery is retrying</strong>
              <span>
                {accountDeliveryStatus.pendingCount} account change
                {accountDeliveryStatus.pendingCount === 1
                  ? " is"
                  : "s are"}{" "}
                still queued. OpenMatch keeps it in order and does not discard
                it automatically. Retry shortly; do not assume the other person
                received it yet.
              </span>
              <button onClick={() => void load()}>Check delivery again</button>
            </div>
          )}
          {securityNotificationDelivery?.state === "retrying" && (
            <div className="account-status" role="status">
              <strong>Security email is retrying</strong>
              <span>
                {securityNotificationDelivery.pendingCount} security notice
                {securityNotificationDelivery.pendingCount === 1
                  ? " has"
                  : "s have"}{" "}
                not reached every confirmed inbox. It remains queued and is
                never silently discarded.
              </span>
              <button
                onClick={async () => {
                  setSecurityNotificationDelivery(
                    await api.retrySecurityNotifications(),
                  );
                }}
              >
                Retry security email
              </button>
            </div>
          )}
          {accountEntryNotice && (
            <div className="account-status" role="status">
              {accountEntryNotice}
            </div>
          )}
          {loading && (
            <div className="empty">
              <p>Loading your private local data…</p>
            </div>
          )}
          {!loading && error && (
            <div className="empty">
              <h2>Couldn’t connect</h2>
              <p>{error}</p>
              <button onClick={() => void load()}>Retry</button>
            </div>
          )}
          {!loading && !error && !onboarded && (
            <>
              {deletionReceipt && (
                <div className="deletion-receipt" role="status">
                  <strong>Local data deletion completed</strong>
                  <span>
                    Completed synchronously at{" "}
                    {new Date(deletionReceipt.completedAt).toLocaleString()}. No
                    application-managed backups exist in this prototype.
                  </span>
                </div>
              )}
              <OnboardingView
                authenticated={Boolean(authToken)}
                directoryAvailable={
                  !emailVerification?.deliveryConfigured ||
                  Boolean(emailVerification.verifiedAt)
                }
                profile={profile}
                preferences={preferences}
                onProfile={setProfile}
                onPreferences={setPreferences}
                complete={async (joinDirectory) => {
                  try {
                    const saved = await api.updateProfile({
                      name: profile.name.trim(),
                      age: profile.age,
                      city: profile.city.trim(),
                      pronouns: profile.pronouns.trim(),
                      gender: profile.gender.trim(),
                      genderGroups: profile.genderGroups,
                      intent: profile.intent,
                      readiness: profile.readiness,
                      bio: profile.bio.trim(),
                      prompt: profile.prompt.trim(),
                      promptAnswer: profile.promptAnswer.trim(),
                      values: profile.values,
                      lifestyle: profile.lifestyle,
                    });
                    await api.updatePreferences(preferences);
                    await api.acceptPrototypeConsent();
                    if (authToken && joinDirectory)
                      await api.updateDirectoryConsent(true);
                    await api.completeOnboarding();
                    setDeletionReceipt(null);
                    setProfile(saved);
                    await load();
                  } catch {
                    setError(
                      "Setup could not be saved. Check the fields and retry.",
                    );
                  }
                }}
              />
            </>
          )}
          {!loading && !error && onboarded && (
            <>
              {accountStatus !== "active" && (
                <div className="account-status" role="status">
                  <strong>
                    {accountStatus === "paused"
                      ? "Introductions paused"
                      : "Profile hidden"}
                  </strong>
                  <span>
                    {accountStatus === "paused"
                      ? "You will not receive new introductions until you resume."
                      : "Your profile is not available for introductions until you make it visible."}
                  </span>
                  <button
                    onClick={() =>
                      void api.updateAccountStatus("active").then(() => load())
                    }
                  >
                    Resume
                  </button>
                </div>
              )}
              {view === "today" && (
                <>
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">
                        {showSaved
                          ? "Saved introductions"
                          : "Your introductions"}
                      </p>
                      <h1>
                        {current
                          ? `${visibleIntroductions.length} remaining`
                          : showSaved
                            ? "Nothing saved"
                            : "You’re all caught up"}
                      </h1>
                    </div>
                    <div>
                      <p className="calm-note">A finite set. Take your time.</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setDetails(false);
                          setShowSaved(!showSaved);
                        }}
                      >
                        {showSaved
                          ? "Back to current batch"
                          : `Saved (${savedIntroductions.length})`}
                      </button>
                    </div>
                  </div>
                  {current ? (
                    <div className="profile-layout">
                      <article className="profile-card">
                        <div
                          className="portrait"
                          style={{ background: current.profile.color }}
                          aria-label={`Placeholder portrait for ${current.profile.name}`}
                        >
                          <span>{current.profile.name.slice(0, 1)}</span>
                          <div className="distance">
                            {current.profile.distanceBand}
                          </div>
                        </div>
                        <div className="profile-copy">
                          <div className="identity">
                            <h2>
                              {current.profile.name}, {current.profile.age}
                            </h2>
                            <p>
                              {current.profile.pronouns} ·{" "}
                              {current.profile.gender} · {current.profile.city}
                            </p>
                          </div>
                          <p className="intent">{current.profile.intent}</p>
                          <p className="readiness">
                            {current.profile.readiness}
                          </p>
                          <p className="bio">{current.profile.bio}</p>
                          <div className="prompt">
                            <span>{current.profile.prompt}</span>
                            <p>{current.profile.promptAnswer}</p>
                          </div>
                          <div className="chips">
                            {current.profile.values.map((value) => (
                              <span key={value}>{value}</span>
                            ))}
                          </div>
                        </div>
                      </article>
                      <aside className="match-panel">
                        <p className="eyebrow">Why this introduction</p>
                        {current.explanation.selectionMode ===
                          "exploration" && (
                          <div className="exploration-note" role="note">
                            <strong>Public lottery slot</strong>
                            <span>
                              One place in this five-person batch is selected
                              reproducibly from eligible profiles. It does not
                              change anyone’s score.
                            </span>
                          </div>
                        )}
                        <div className="score">
                          {Math.round(current.explanation.finalScore * 100)}
                          <small>%</small>
                        </div>
                        <p className="score-label">
                          fit with explicit preferences you both control—not
                          predicted chemistry.
                        </p>
                        <ul>
                          {current.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        <button
                          className="text-button"
                          onClick={() => setDetails(!details)}
                        >
                          {details
                            ? "Hide calculation"
                            : "See the full calculation"}
                        </button>
                        {details && (
                          <div className="calculation">
                            <p>
                              <strong>
                                Your directed fit:{" "}
                                {Math.round(
                                  current.explanation.directedFitA * 100,
                                )}
                                %
                              </strong>
                            </p>
                            {current.explanation.factorsForA.map((factor) => (
                              <div key={factor.id}>
                                <span>{factor.label}</span>
                                <strong>
                                  {Math.round(factor.compatibility * 100)}% ×{" "}
                                  {Math.round(factor.weight * 100)}%
                                </strong>
                              </div>
                            ))}
                            <p>
                              <strong>
                                Their directed fit:{" "}
                                {Math.round(
                                  current.explanation.directedFitB * 100,
                                )}
                                %
                              </strong>
                            </p>
                            {current.explanation.factorsForB ? (
                              current.explanation.factorsForB.map((factor) => (
                                <div key={factor.id}>
                                  <span>{factor.label}</span>
                                  <strong>
                                    {Math.round(factor.compatibility * 100)}% ×{" "}
                                    {Math.round(factor.weight * 100)}%
                                  </strong>
                                </div>
                              ))
                            ) : (
                              <p className="private-input-note">
                                Their factor weights are private personal
                                inputs. The score uses the published formula and
                                no undocumented system factors.
                              </p>
                            )}
                            <p>
                              Harmonic mean:{" "}
                              {Math.round(
                                current.explanation.reciprocalFit * 100,
                              )}
                              % · Explicit inputs only · No undocumented system
                              factors.
                            </p>
                            <p>
                              Selection: {current.explanation.selectionMode} ·
                              probability{" "}
                              {Math.round(
                                current.explanation.selectionProbability * 100,
                              )}
                              %
                              {current.explanation.weeklySeed
                                ? ` · public seed ${current.explanation.weeklySeed}`
                                : ""}
                            </p>
                          </div>
                        )}
                        <div className="decision-row">
                          <button
                            className="pass"
                            onClick={async () => {
                              if (showSaved) {
                                await api.unsaveIntroduction(
                                  current.profile.id,
                                );
                                setShowSaved(false);
                              } else {
                                await api.saveIntroduction(current.profile.id);
                                setNotice(
                                  `${current.profile.name} saved for this prototype batch.`,
                                );
                              }
                              setDetails(false);
                              await load();
                            }}
                          >
                            {showSaved ? "Return to batch" : "Save for later"}
                          </button>
                          <button
                            className="pass"
                            onClick={() => decide("passed")}
                          >
                            Pass
                          </button>
                          <button
                            className="interest"
                            onClick={() => decide("interested")}
                          >
                            Interested
                          </button>
                        </div>
                        <p className="private-note">
                          Your decision is private unless interest is mutual.
                        </p>
                        <CandidateSafety
                          name={current.profile.name}
                          notice={notice}
                          block={async () => {
                            if (
                              window.confirm(
                                `Block ${current.profile.name}? They will no longer appear in your introductions.`,
                              )
                            ) {
                              await runCrossAccountAction(
                                () => api.block(current.profile.id),
                                "The block could not be completed.",
                              );
                            }
                          }}
                          report={async (reason, reportDetails) => {
                            try {
                              const result = await api.report(
                                current.profile.id,
                                reason,
                                reportDetails,
                              );
                              setNotice(
                                `Report received. This profile is concealed from future introductions. Reference status: ${result.status}.`,
                              );
                              setReports((await api.reports()).items);
                              await load();
                            } catch (error) {
                              setError(
                                operationLimitMessage(
                                  error,
                                  "The report could not be sent. Please retry.",
                                ),
                              );
                              throw error;
                            }
                          }}
                        />
                      </aside>
                    </div>
                  ) : (
                    <div className="empty">
                      <div className="empty-mark">✓</div>
                      <h2>That’s the whole set.</h2>
                      <p>
                        {showSaved
                          ? "Saved profiles stay here until you return them, decide, or delete this local prototype."
                          : `No endless feed and no recycling decisions. The next weekly batch window begins${
                              nextBatchAt
                                ? ` ${new Date(nextBatchAt).toLocaleDateString(
                                    undefined,
                                    {
                                      weekday: "long",
                                      month: "long",
                                      day: "numeric",
                                      timeZone: "UTC",
                                    },
                                  )}`
                                : " later"
                            }. Only newly eligible profiles may appear.`}
                      </p>
                      {showSaved && (
                        <button onClick={() => setShowSaved(false)}>
                          Back to current batch
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {view === "preferences" && (
                <PreferencesView
                  value={preferences}
                  delivery={delivery}
                  setBatchSize={async (batchSize) => {
                    const next = await api.updateDeliverySettings(batchSize);
                    setDelivery(next);
                    setIntroductions((await api.introductions()).items);
                  }}
                  suggestions={suggestions}
                  observationCount={preferenceObservationCount}
                  clearObservations={async () => {
                    if (
                      !window.confirm(
                        "Clear the decision examples used for preference suggestions? Your Interested and Pass decisions will stay unchanged.",
                      )
                    )
                      return;
                    try {
                      const result = await api.clearPreferenceObservations();
                      setSuggestions([]);
                      setPreferenceObservationCount(result.observationCount);
                      setNotice(
                        result.cleared
                          ? `Cleared ${result.cleared} learning example${result.cleared === 1 ? "" : "s"}.`
                          : "There were no learning examples to clear.",
                      );
                    } catch {
                      setError("Learning examples could not be cleared.");
                    }
                  }}
                  onChange={(next) => void savePreferences(next)}
                />
              )}
              {view === "connections" && (
                <ConnectionsView
                  connections={connections}
                  connection={selectedConnection}
                  selectConnection={setSelectedConnectionId}
                  messages={messages}
                  notice={notice}
                  draft={draft}
                  setDraft={(value) => {
                    setDraft(value);
                    if (pendingMessageAttempt?.text !== value)
                      setPendingMessageAttempts((current) => {
                        if (!selectedConnection) return current;
                        const next = { ...current };
                        delete next[selectedConnection.id];
                        return next;
                      });
                  }}
                  send={async () => {
                    const text = draft.trim();
                    if (!text || !selectedConnection) return;
                    const safetyFlags = messageSafetyFlags(text);
                    if (
                      safetyFlags.length > 0 &&
                      !window.confirm(
                        `Pause before sending\n\n${safetyFlags
                          .map((flag) => `${flag.label}: ${flag.explanation}`)
                          .join(
                            "\n\n",
                          )}\n\nThese simple rules can be wrong. Send anyway?`,
                      )
                    )
                      return;
                    const messageAttempt =
                      pendingMessageAttempt?.text === text
                        ? pendingMessageAttempt
                        : {
                            text,
                            requestId: globalThis.crypto.randomUUID(),
                          };
                    persistPendingMessageAttempts(window.sessionStorage, {
                      ...pendingMessageAttempts,
                      [selectedConnection.id]: messageAttempt,
                    });
                    setPendingMessageAttempts((current) => ({
                      ...current,
                      [selectedConnection.id]: messageAttempt,
                    }));
                    try {
                      const message = await api.sendMessage(
                        selectedConnection.id,
                        text,
                        safetyFlags.length > 0,
                        messageAttempt.requestId,
                      );
                      setMessages((previous) => [...previous, message]);
                      setConversationDrafts((current) => {
                        const next = { ...current };
                        delete next[selectedConnection.id];
                        return next;
                      });
                      setPendingMessageAttempts((current) => {
                        const next = { ...current };
                        delete next[selectedConnection.id];
                        persistPendingMessageAttempts(
                          window.sessionStorage,
                          next,
                        );
                        return next;
                      });
                    } catch (error) {
                      await handleDeliveryFailure(
                        error,
                        "Message could not be sent.",
                      );
                    }
                  }}
                  unmatch={async () => {
                    if (selectedConnection) {
                      await runCrossAccountAction(
                        () => api.unmatch(selectedConnection.id),
                        "The conversation could not be closed.",
                      );
                    }
                  }}
                  closePolitely={async () => {
                    if (selectedConnection) {
                      await runCrossAccountAction(
                        () => api.closePolitely(selectedConnection.id),
                        "The polite close could not be delivered.",
                      );
                    }
                  }}
                  setMuted={async (muted) => {
                    if (selectedConnection) {
                      await api.updateConnectionMute(
                        selectedConnection.id,
                        muted,
                      );
                      await load();
                    }
                  }}
                  setMeetingPreference={async (meetingPreference) => {
                    if (selectedConnection) {
                      await api.updateMeetingPreference(
                        selectedConnection.id,
                        meetingPreference,
                      );
                      await load();
                    }
                  }}
                  block={async () => {
                    if (selectedConnection) {
                      await runCrossAccountAction(
                        () => api.block(selectedConnection.profileId),
                        "The block could not be completed.",
                      );
                    }
                  }}
                  report={async (reason, reportDetails) => {
                    if (selectedConnection) {
                      try {
                        const result = await api.report(
                          selectedConnection.profileId,
                          reason,
                          reportDetails,
                        );
                        setNotice(
                          `Report received. This profile is concealed from future introductions; this conversation remains available until you unmatch or block. Reference status: ${result.status}.`,
                        );
                        setReports((await api.reports()).items);
                      } catch (error) {
                        setError(
                          operationLimitMessage(
                            error,
                            "The report could not be sent. Please retry.",
                          ),
                        );
                        throw error;
                      }
                    }
                  }}
                />
              )}
              {view === "profile" && (
                <ProfileView
                  profile={profile}
                  saveProfile={async (patch) => {
                    const saved = await api.updateProfile(patch);
                    setProfile(saved);
                  }}
                  accountStatus={accountStatus}
                  reports={reports}
                  genderPreferencesConfigured={
                    preferences.genderGroups.length > 0
                  }
                  addReportUpdate={async (reportId, kind, details) => {
                    await api.addReportUpdate(reportId, kind, details);
                    setReports((await api.reports()).items);
                  }}
                  researchConsent={researchConsent}
                  directoryConsent={directoryConsent}
                  setDirectoryConsent={async (participating) => {
                    setDirectoryConsent(
                      await api.updateDirectoryConsent(participating),
                    );
                    await load();
                  }}
                  sessions={authToken ? accountSessions : []}
                  emailVerification={emailVerification}
                  notificationEmail={notificationEmail}
                  requestNotificationEmail={
                    authToken
                      ? async (email, currentPassword) => {
                          await api.requestNotificationEmail(
                            email,
                            currentPassword,
                          );
                          setNotificationEmail(await api.notificationEmail());
                        }
                      : undefined
                  }
                  confirmNotificationEmail={
                    authToken
                      ? async (code) => {
                          const result =
                            await api.confirmNotificationEmail(code);
                          setNotificationEmail(result);
                          return synchronizeSecurityNotification(
                            result.securityNotification,
                          );
                        }
                      : undefined
                  }
                  removeNotificationEmail={
                    authToken
                      ? async (currentPassword) => {
                          const result =
                            await api.removeNotificationEmail(currentPassword);
                          setNotificationEmail(result);
                          return synchronizeSecurityNotification(
                            result.securityNotification,
                          );
                        }
                      : undefined
                  }
                  requestEmailVerification={
                    authToken
                      ? async () => {
                          await api.requestEmailVerification();
                        }
                      : undefined
                  }
                  confirmEmail={
                    authToken
                      ? async (code) => {
                          await api.confirmEmail(code);
                          setEmailVerification(await api.emailVerification());
                        }
                      : undefined
                  }
                  changePassword={
                    authToken
                      ? async (currentPassword, newPassword) => {
                          const result = await api.changePassword(
                            currentPassword,
                            newPassword,
                          );
                          setAccountSessions((await api.sessions()).items);
                          return synchronizeSecurityNotification(
                            result.securityNotification,
                          );
                        }
                      : undefined
                  }
                  generateRecoveryCodes={
                    authToken
                      ? async (currentPassword) => {
                          const result =
                            await api.generateRecoveryCodes(currentPassword);
                          await synchronizeSecurityNotification(
                            result.securityNotification,
                          );
                          return result;
                        }
                      : undefined
                  }
                  revokeSession={async (sessionId) => {
                    await api.revokeSession(sessionId);
                    setAccountSessions((await api.sessions()).items);
                  }}
                  setResearchConsent={async (participating) => {
                    setResearchConsent(
                      await api.updateResearchConsent(participating),
                    );
                  }}
                  setAccountStatus={async (status) => {
                    const result = await api.updateAccountStatus(status);
                    setAccountStatus(result.status);
                    setIntroductions((await api.introductions()).items);
                  }}
                  exportData={async () => {
                    const data = await api.exportData();
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = "openmatch-data.json";
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                  deleteData={async () => {
                    if (
                      window.confirm(
                        "Delete all local OpenMatch demo data? This cannot be undone.",
                      )
                    ) {
                      setDeletionReceipt(await api.deleteAccountData());
                      await load();
                    }
                  }}
                  deleteAccount={
                    authToken
                      ? async () => {
                          if (
                            window.confirm(
                              "Delete this OpenMatch account, credentials, sessions, and all application data? This cannot be undone.",
                            )
                          ) {
                            await api.deleteAccount();
                            exit();
                          }
                        }
                      : undefined
                  }
                />
              )}
              {view === "about" && (
                <AboutView
                  transparency={transparency}
                  authenticated={Boolean(authToken)}
                />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Mark() {
  return (
    <span className="openmatch-mark" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function securityNotice(status: SecurityNotificationStatus) {
  return status === "sent"
    ? " A separate security notice was sent to every confirmed notification email."
    : status === "partial"
      ? " The change succeeded, but the security notice reached only some confirmed notification emails."
      : status === "failed"
        ? " The change succeeded, but the security email could not be delivered."
        : status === "unverified"
          ? " The change succeeded, but this inbox is not confirmed, so no security email was sent."
          : " Security-email delivery is not configured on this server.";
}

function LandingPage({
  signIn,
  tryDemo,
  demoError,
}: {
  signIn: () => void;
  tryDemo: () => void;
  demoError: string | null;
}) {
  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="OpenMatch home">
          <Mark />
          OpenMatch
        </a>
        <nav aria-label="Website navigation">
          <a href="#how">How it works</a>
          <a href="#principles">Principles</a>
          <a href="#evidence">Evidence</a>
          <a href="#transparency">Transparency</a>
          <a href="#apps">Apps</a>
          <a href="#support">Get help</a>
        </nav>
        <button className="nav-sign-in" onClick={signIn}>
          Sign in
        </button>
      </header>

      <section className="hero" id="top">
        <p className="landing-eyebrow">A nonprofit introduction service</p>
        <h1>Made to help you leave.</h1>
        <p className="hero-copy">
          OpenMatch offers a small number of thoughtful introductions, explains
          every one, and has no reason to keep you swiping. No ads. No premium
          ranking. No hidden score.
        </p>
        <div className="hero-actions">
          <button
            className="primary-action"
            onClick={tryDemo}
            disabled={Boolean(demoError)}
            aria-describedby={demoError ? "hosted-demo-status" : undefined}
          >
            Try the private demo
          </button>
          <a className="text-action" href="#how">
            See how matching works <span aria-hidden="true">↓</span>
          </a>
        </div>
        {demoError && (
          <p className="demo-status" id="hosted-demo-status" role="status">
            {demoError} No connection was attempted.
          </p>
        )}
        <div className="hero-proof" aria-label="OpenMatch commitments">
          <span>Open source</span>
          <span>Nonprofit</span>
          <span>Finite introductions</span>
          <span>Your data is yours</span>
        </div>
      </section>

      <section className="promise" id="principles">
        <div>
          <p className="landing-eyebrow">Different incentives</p>
          <h2>The product succeeds when you meet someone—not when you stay.</h2>
        </div>
        <div className="promise-grid">
          <article>
            <span>01</span>
            <h3>No attention tricks</h3>
            <p>
              A finite set of introductions replaces the endless feed. There are
              no streaks, boosts, ads, or pay-to-win placement.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Nothing hidden</h3>
            <p>
              See which factors contributed, how they were weighted, and the
              exact public code that produced an introduction.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>You remain in control</h3>
            <p>
              Learning can suggest preference changes, but it never changes your
              settings or decides who you should like.
            </p>
          </article>
        </div>
      </section>

      <section className="algorithm-section" id="how">
        <div className="algorithm-intro">
          <p className="landing-eyebrow">The whole matching idea</p>
          <h2>Five understandable steps. No black box.</h2>
          <p>
            OpenMatch does not claim to calculate love. It helps find people
            whose stated needs fit in both directions, then gets out of the way.
          </p>
        </div>
        <AlgorithmGraphic />
        <div className="plain-formula">
          <p>What raises an introduction</p>
          <strong>Mutual fit, not one-sided appeal</strong>
          <span>
            Both people’s needs count. A weak fit on either side pulls the
            result down.
          </span>
        </div>
      </section>

      <section className="evidence-section" id="evidence">
        <div className="evidence-heading">
          <p className="landing-eyebrow">Evidence, with humility</p>
          <h2>Research guides the choices. It does not make promises.</h2>
        </div>
        <div className="evidence-copy">
          <p>
            Relationship research supports asking about important values,
            relationship intentions, habits, and constraints. But studies also
            show that long-term chemistry is difficult to predict from profile
            answers alone.
          </p>
          <p>
            So OpenMatch uses evidence to remove obvious incompatibilities and
            create plausible introductions—not to label anyone a soulmate. We
            publish the sources, uncertainties, decisions, and revisions.
          </p>
          <div className="evidence-links">
            <a
              href="https://github.com/jannis-cmd/openmatch/blob/main/research/LITERATURE_MAP.md"
              target="_blank"
              rel="noreferrer"
            >
              Read the research map ↗
            </a>
            <a
              href="https://github.com/jannis-cmd/openmatch/blob/main/docs/MATCHING.md"
              target="_blank"
              rel="noreferrer"
            >
              Inspect the matching method ↗
            </a>
          </div>
        </div>
      </section>

      <section className="public-transparency" id="transparency">
        <div className="evidence-heading">
          <p className="landing-eyebrow">Inspect everything</p>
          <h2>Transparency before an account.</h2>
          <p>
            The formula, source, evidence, personal-data inventory, decisions,
            and limitations are public. You do not need to sign in or enter the
            demo to inspect them.
          </p>
        </div>
        <div className="public-resource-grid">
          <a
            href="https://github.com/jannis-cmd/openmatch/blob/main/packages/matching/src/index.ts"
            target="_blank"
            rel="noreferrer"
          >
            <strong>Matching source</strong>
            <span>The exact deterministic kernel.</span>
          </a>
          <a
            href="https://github.com/jannis-cmd/openmatch/blob/main/research/EVIDENCE_REGISTER.md"
            target="_blank"
            rel="noreferrer"
          >
            <strong>Evidence register</strong>
            <span>Claims, grades, uncertainties, and exclusions.</span>
          </a>
          <a
            href="https://github.com/jannis-cmd/openmatch/blob/main/docs/ALGORITHM_DECISIONS.md"
            target="_blank"
            rel="noreferrer"
          >
            <strong>Decision history</strong>
            <span>
              Why each formula choice exists and what could change it.
            </span>
          </a>
          <a
            href="https://github.com/jannis-cmd/openmatch/blob/main/docs/DATA_INVENTORY.json"
            target="_blank"
            rel="noreferrer"
          >
            <strong>Data inventory</strong>
            <span>
              Every current field, purpose, retention, and access role.
            </span>
          </a>
        </div>
        <div className="public-limit">
          <h3>Known limits</h3>
          <p>
            This prototype cannot predict attraction, love, relationship
            success, or safety. A passing test proves implementation behavior,
            not fairness or effectiveness with real people. Those claims need
            prospective, independent evaluation.
          </p>
        </div>
        <ScoreCalculator />
      </section>

      <section className="app-downloads" id="apps">
        <div className="evidence-heading">
          <p className="landing-eyebrow">Owner testing</p>
          <h2>Real native builds. Private beta limits.</h2>
          <p>
            Android and iOS now compile as native applications. They connect to
            the same transparent matching service as the web app. This remains
            an owner-only beta—not a public app-store launch.
          </p>
        </div>
        <div className="download-grid">
          <article>
            <span className="download-platform">Android</span>
            <h3>Install build 10</h3>
            <p>
              Open the APK on an Android phone. The phone must be signed into
              the <code>cheetah-vernier</code> tailnet, and Android may ask you
              to allow installation from the browser.
            </p>
            <a
              className="primary-action download-action"
              href="https://expo.dev/artifacts/eas/QgNIPOR4gCsrI0iGhB8Y3wMNZeAWC5hjzdqQyXstxto.apk"
            >
              Download Android APK
            </a>
          </article>
          <article>
            <span className="download-platform">iPhone and iPad</span>
            <h3>TestFlight pending</h3>
            <p>
              Native iOS compilation is verified with a Simulator build.
              Installation on an iPhone still requires active Apple Developer
              Program enrollment and a signed TestFlight build.
            </p>
            <span className="pending-action" role="status">
              Waiting for Apple enrollment
            </span>
          </article>
        </div>
        <p className="download-provenance">
          Every artifact, source commit, size, SHA-256 checksum, and validation
          limit is public in the{" "}
          <a href="https://github.com/jannis-cmd/openmatch/blob/main/docs/RELEASE_ARTIFACTS.md">
            verified artifact record ↗
          </a>
          .
        </p>
      </section>

      <section className="public-support" id="support">
        <SafetySupportCard />
      </section>

      <section className="final-callout">
        <Mark />
        <h2>A calmer way to meet.</h2>
        <p>
          The first prototype is local, transparent, and intentionally small.
        </p>
        <button
          className="primary-action"
          onClick={tryDemo}
          disabled={Boolean(demoError)}
          aria-describedby={demoError ? "hosted-demo-status" : undefined}
        >
          Open the demo
        </button>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>OpenMatch</strong>
          <span>Nonprofit · Open source · In development</span>
        </div>
        <div>
          <a href="https://github.com/jannis-cmd/openmatch">GitHub</a>
          <a href="#evidence">Research</a>
          <a href="/privacy">Privacy</a>
          <a href="/support">Support</a>
          <button onClick={signIn}>Sign in</button>
        </div>
      </footer>
    </main>
  );
}

function AlgorithmGraphic() {
  const steps = [
    {
      number: "1",
      title: "Boundaries first",
      copy: "Age, distance, intent, and other non-negotiables must work for both people.",
    },
    {
      number: "2",
      title: "Fit both ways",
      copy: "Your preferences are compared with their profile—and theirs with yours.",
    },
    {
      number: "3",
      title: "Balance the result",
      copy: "The weaker direction matters, preventing one-sided compatibility from looking strong.",
    },
    {
      number: "4",
      title: "Keep one public lottery place",
      copy: "In a five-person batch, one eligible profile is selected with a reproducible weekly seed. The score never changes.",
    },
    {
      number: "5",
      title: "Offer a few introductions",
      copy: "You choose independently. A conversation opens only after mutual interest.",
    },
  ];

  return (
    <div
      className="algorithm-flow"
      aria-label="The five OpenMatch matching steps"
    >
      {steps.map((step, index) => (
        <div className="algorithm-step" key={step.number}>
          <div className="step-number">{step.number}</div>
          <div className="step-copy">
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </div>
          {index < steps.length - 1 && (
            <span className="flow-line" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}

function SignInPage({
  back,
  apiUrl,
  continueToApp,
  demoError,
  entryNotice,
}: {
  back: () => void;
  apiUrl: string | null;
  continueToApp: (
    token: string,
    notification?: SecurityNotificationStatus,
  ) => void;
  demoError: string | null;
  entryNotice: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create" | "recover">("sign-in");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const api = useMemo(
    () =>
      apiUrl
        ? createApiClient(apiUrl, fetch, {
            demoSessions: false,
            client: "web",
          })
        : null,
    [apiUrl],
  );

  return (
    <main className="sign-in-shell">
      <button className="sign-in-brand" onClick={back}>
        <Mark /> OpenMatch
      </button>
      <form
        className="sign-in-card"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!api) return;
          setSubmitting(true);
          setAuthError(null);
          try {
            const session =
              mode === "create"
                ? await api.createAccount(email, password)
                : mode === "recover"
                  ? await api.recoverAccount(email, recoveryCode, password)
                  : await api.signIn(email, password);
            continueToApp(
              session.token,
              mode === "recover" && "securityNotification" in session
                ? (session.securityNotification as SecurityNotificationStatus)
                : undefined,
            );
          } catch (error) {
            const code = error instanceof Error ? error.message : "";
            setAuthError(
              code.includes("account_exists")
                ? "An account already uses that email. Sign in instead."
                : code.includes("invalid_email")
                  ? "Enter a valid email address."
                  : code.includes("common_password")
                    ? "Choose a less common passphrase."
                    : code.includes("invalid_password")
                      ? "Use a passphrase between 15 and 128 characters."
                      : code.includes("invalid_recovery")
                        ? "The email or unused recovery code was not accepted."
                        : code.includes("password_unchanged")
                          ? "Choose a new passphrase different from the current one."
                          : "Email or passphrase was not accepted.",
            );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {entryNotice && (
          <div className="account-status" role="status">
            {entryNotice}
          </div>
        )}
        <p className="landing-eyebrow">Private account</p>
        <h1>
          {mode === "create"
            ? "Create your account."
            : mode === "recover"
              ? "Recover your account."
              : "Welcome back."}
        </h1>
        <p>
          Your private data and conversations stay isolated. After setup, the
          public profile you choose can appear to mutually eligible active
          accounts in the same approximate region. OpenMatch stores a protected
          passphrase hash—not your passphrase.
        </p>
        {demoError && (
          <p role="status">{demoError} No connection was attempted.</p>
        )}
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
        {mode === "recover" && (
          <>
            <label htmlFor="recovery-code">Unused recovery code</label>
            <input
              id="recovery-code"
              autoComplete="one-time-code"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx"
              required
            />
          </>
        )}
        <label htmlFor="sign-in-password">
          {mode === "recover" ? "New passphrase" : "Passphrase"}
        </label>
        <input
          id="sign-in-password"
          type="password"
          autoComplete={
            mode === "create" || mode === "recover"
              ? "new-password"
              : "current-password"
          }
          minLength={mode === "create" || mode === "recover" ? 15 : undefined}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {authError && <p role="alert">{authError}</p>}
        <button
          className="primary-action"
          type="submit"
          disabled={Boolean(demoError) || submitting}
        >
          {submitting
            ? "Please wait…"
            : mode === "create"
              ? "Create account"
              : mode === "recover"
                ? "Recover account"
                : "Sign in"}
        </button>
        <button
          className="back-action"
          type="button"
          onClick={() => {
            setAuthError(null);
            setMode(mode === "create" ? "sign-in" : "create");
          }}
        >
          {mode === "create"
            ? "I already have an account"
            : "Create an account"}
        </button>
        <button
          className="back-action"
          type="button"
          onClick={() => {
            setAuthError(null);
            setRecoveryCode("");
            setMode(mode === "recover" ? "sign-in" : "recover");
          }}
        >
          {mode === "recover" ? "Back to sign in" : "Use a recovery code"}
        </button>
        <button className="back-action" type="button" onClick={back}>
          Back to the website
        </button>
      </form>
    </main>
  );
}

function Nav({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function MatchingProfileFields({
  value,
  onChange,
}: {
  value: Profile;
  onChange: (value: Profile) => void;
}) {
  const [valuesText, setValuesText] = useState(value.values.join(", "));
  const updateValues = (text: string) => {
    setValuesText(text);
    const values = text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
    onChange({ ...value, values });
  };

  return (
    <>
      <label>
        Profile prompt
        <input
          value={value.prompt}
          maxLength={100}
          onChange={(event) =>
            onChange({ ...value, prompt: event.target.value })
          }
        />
      </label>
      <label>
        Your answer
        <textarea
          value={value.promptAnswer}
          maxLength={500}
          onChange={(event) =>
            onChange({ ...value, promptAnswer: event.target.value })
          }
        />
      </label>
      <label>
        Values <span className="optional">1–5, separated by commas</span>
        <input
          value={valuesText}
          maxLength={210}
          onChange={(event) => updateValues(event.target.value)}
        />
      </label>
      <label>
        Smoking
        <select
          value={value.lifestyle.smoking}
          onChange={(event) =>
            onChange({
              ...value,
              lifestyle: {
                ...value.lifestyle,
                smoking: event.target.value as Profile["lifestyle"]["smoking"],
              },
            })
          }
        >
          <option value="no">Do not smoke</option>
          <option value="sometimes">Smoke sometimes</option>
        </select>
      </label>
      <label>
        Children
        <select
          value={value.lifestyle.children}
          onChange={(event) =>
            onChange({
              ...value,
              lifestyle: {
                ...value.lifestyle,
                children: event.target
                  .value as Profile["lifestyle"]["children"],
              },
            })
          }
        >
          <option value="want">Want children</option>
          <option value="open">Open to children</option>
          <option value="do not want">Do not want children</option>
        </select>
      </label>
      <label>
        Typical schedule
        <select
          value={value.lifestyle.schedule}
          onChange={(event) =>
            onChange({
              ...value,
              lifestyle: {
                ...value.lifestyle,
                schedule: event.target
                  .value as Profile["lifestyle"]["schedule"],
              },
            })
          }
        >
          <option value="early">Usually early</option>
          <option value="flexible">Flexible</option>
          <option value="late">Usually late</option>
        </select>
      </label>
      <p className="help">
        These are matching inputs. They are never inferred from your behavior,
        and every change takes effect when you save.
      </p>
    </>
  );
}

function OnboardingView({
  authenticated,
  directoryAvailable,
  profile,
  preferences,
  onProfile,
  onPreferences,
  complete,
}: {
  authenticated: boolean;
  directoryAvailable: boolean;
  profile: Profile;
  preferences: Preferences;
  onProfile: (value: Profile) => void;
  onPreferences: (value: Preferences) => void;
  complete: (joinDirectory: boolean) => Promise<void>;
}) {
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [dataUseAccepted, setDataUseAccepted] = useState(false);
  const [directoryAccepted, setDirectoryAccepted] = useState(false);
  const valid =
    profile.name.trim().length > 0 &&
    profile.city.trim().length > 0 &&
    profile.bio.trim().length > 0 &&
    profile.prompt.trim().length > 0 &&
    profile.promptAnswer.trim().length > 0 &&
    profile.values.length > 0 &&
    profile.gender.trim().length > 0 &&
    profile.genderGroups.length > 0 &&
    preferences.genderGroups.length > 0 &&
    profile.age >= 18 &&
    profile.age <= 120 &&
    adultConfirmed &&
    dataUseAccepted;
  return (
    <div className="narrow">
      <p className="eyebrow">A small, honest beginning</p>
      <h1>Set your boundaries.</h1>
      <p className="intro-copy">
        Only explicit information affects your introductions. You can inspect or
        change every input later.
      </p>
      <section className="settings-card">
        <h2>Your public profile</h2>
        <label>
          Name
          <input
            value={profile.name}
            maxLength={50}
            onChange={(event) =>
              onProfile({ ...profile, name: event.target.value })
            }
          />
        </label>
        <label>
          Age
          <input
            type="number"
            min="18"
            max="120"
            value={profile.age}
            onChange={(event) =>
              onProfile({ ...profile, age: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Approximate city or region
          <input
            value={profile.city}
            maxLength={80}
            onChange={(event) =>
              onProfile({ ...profile, city: event.target.value })
            }
          />
        </label>
        <label>
          Pronouns <span className="optional">optional</span>
          <input
            value={profile.pronouns}
            maxLength={50}
            onChange={(event) =>
              onProfile({ ...profile, pronouns: event.target.value })
            }
          />
        </label>
        <GenderDiscoveryFields value={profile} onChange={onProfile} />
        <label>
          Relationship intention
          <select
            value={profile.intent}
            onChange={(event) =>
              onProfile({
                ...profile,
                intent: event.target.value as Profile["intent"],
              })
            }
          >
            <option>Long-term relationship</option>
            <option>Long-term, open to short</option>
            <option>Still figuring it out</option>
          </select>
        </label>
        <label>
          Meeting readiness
          <select
            value={profile.readiness}
            onChange={(event) =>
              onProfile({
                ...profile,
                readiness: event.target.value as Profile["readiness"],
              })
            }
          >
            <option>Prefer to chat first</option>
            <option>Ready to meet in person</option>
          </select>
        </label>
        <label>
          About you
          <textarea
            value={profile.bio}
            maxLength={500}
            onChange={(event) =>
              onProfile({ ...profile, bio: event.target.value })
            }
          />
        </label>
        <MatchingProfileFields value={profile} onChange={onProfile} />
      </section>
      <section className="settings-card">
        <h2>Mutual eligibility</h2>
        <label>
          Youngest age <strong>{preferences.ageMin}</strong>
          <input
            type="range"
            min="18"
            max={preferences.ageMax}
            value={preferences.ageMin}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                ageMin: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Oldest age <strong>{preferences.ageMax}</strong>
          <input
            type="range"
            min={preferences.ageMin}
            max="80"
            value={preferences.ageMax}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                ageMax: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Maximum distance <strong>{preferences.maximumDistanceKm} km</strong>
          <input
            type="range"
            min={preferences.idealDistanceKm}
            max="100"
            value={preferences.maximumDistanceKm}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                maximumDistanceKm: Number(event.target.value),
              })
            }
          />
        </label>
        <BoundaryFields value={preferences} onChange={onPreferences} />
      </section>
      <section className="settings-card">
        <h2>Your ordering priorities</h2>
        {Object.entries(preferences.weights).map(([key, weight]) => {
          const index = PRIORITY_LEVELS.reduce(
            (best, level, i) =>
              Math.abs(level - weight) <
              Math.abs(PRIORITY_LEVELS[best] - weight)
                ? i
                : best,
            0,
          );
          return (
            <label key={key}>
              <span className="capitalize">{key}</span>
              <strong>{priorityLabel(weight)}</strong>
              <input
                type="range"
                min="0"
                max="3"
                value={index}
                onChange={(event) =>
                  onPreferences({
                    ...preferences,
                    weights: {
                      ...preferences.weights,
                      [key]: PRIORITY_LEVELS[Number(event.target.value)],
                    },
                  })
                }
              />
            </label>
          );
        })}
        <p className="help">
          These priorities order mutually eligible people. They do not measure
          anyone’s worth or predict chemistry.
        </p>
        <div className="prototype-consent">
          <h3>Before opening the prototype</h3>
          <label>
            <input
              type="checkbox"
              checked={adultConfirmed}
              onChange={(event) => setAdultConfirmed(event.target.checked)}
            />
            I confirm that I am at least 18 years old.
          </label>
          <label>
            <input
              type="checkbox"
              checked={dataUseAccepted}
              onChange={(event) => setDataUseAccepted(event.target.checked)}
            />
            I understand this prototype stores the profile, preferences,
            decisions, messages, and safety actions I enter so its features can
            work. I can export or delete them from Profile.
          </label>
          {authenticated && (
            <label>
              <input
                type="checkbox"
                checked={directoryAccepted}
                disabled={!directoryAvailable}
                onChange={(event) => setDirectoryAccepted(event.target.checked)}
              />
              I separately choose to join account matching. After setup while
              Active, my chosen public profile can be shown to mutually eligible
              accounts whose approximate city or region text exactly matches
              mine. My private preferences and one-sided decisions are not
              shown. I can withdraw this from Profile.
              {!directoryAvailable &&
                " Confirm your email from Profile before enabling this."}
            </label>
          )}
          <p className="help">
            Receipt version prototype-0.1. This is not consent to research,
            advertising, contact uploads, or hidden tracking.
          </p>
        </div>
        <button
          className="interest"
          disabled={!valid}
          onClick={() => void complete(directoryAccepted)}
        >
          See my introductions
        </button>
      </section>
    </div>
  );
}

function BoundaryFields({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  const intents: Profile["intent"][] = [
    "Long-term relationship",
    "Long-term, open to short",
    "Still figuring it out",
  ];
  return (
    <div className="boundary-fields">
      <fieldset>
        <legend>People you are open to meeting</legend>
        {GENDER_DISCOVERY_GROUPS.map((group) => (
          <label key={group}>
            <input
              type="checkbox"
              checked={value.genderGroups.includes(group)}
              onChange={(event) =>
                onChange({
                  ...value,
                  genderGroups: event.target.checked
                    ? [...value.genderGroups, group]
                    : value.genderGroups.filter((item) => item !== group),
                })
              }
            />
            {genderGroupLabel(group)}
          </label>
        ))}
        <p className="help">
          Private boundary. An introduction appears only when both people’s
          discovery choices include one another.
        </p>
      </fieldset>
      <fieldset>
        <legend>Relationship intentions you are open to</legend>
        {intents.map((intent) => (
          <label key={intent}>
            <input
              type="checkbox"
              checked={value.intents.includes(intent)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...value.intents, intent]
                  : value.intents.filter((item) => item !== intent);
                if (next.length) onChange({ ...value, intents: next });
              }}
            />
            {intent}
          </label>
        ))}
      </fieldset>
      <label>
        Smoking boundary
        <select
          value={value.smoking}
          onChange={(event) =>
            onChange({
              ...value,
              smoking: event.target.value as Preferences["smoking"],
            })
          }
        >
          <option value="no">Non-smoking only</option>
          <option value="any">No boundary</option>
        </select>
      </label>
      <label>
        Children boundary
        <select
          value={value.children}
          onChange={(event) =>
            onChange({
              ...value,
              children: event.target.value as Preferences["children"],
            })
          }
        >
          <option value="want">Wants children</option>
          <option value="open">Open to children</option>
          <option value="do not want">Does not want children</option>
          <option value="any">No boundary</option>
        </select>
      </label>
      <p className="help">
        These are mutual boundaries. A person is introduced only when both
        people’s stated boundaries are satisfied.
      </p>
    </div>
  );
}

const genderGroupLabel = (group: GenderDiscoveryGroup) =>
  ({
    women: "Women",
    men: "Men",
    nonbinary_people: "Nonbinary people",
  })[group];

function GenderDiscoveryFields({
  value,
  onChange,
}: {
  value: Profile;
  onChange: (value: Profile) => void;
}) {
  return (
    <fieldset>
      <legend>Gender and discovery</legend>
      <label>
        How you describe your gender
        <input
          value={value.gender}
          maxLength={50}
          placeholder="For example: woman, man, nonbinary, agender"
          onChange={(event) =>
            onChange({ ...value, gender: event.target.value })
          }
        />
      </label>
      <div className="checkbox-grid">
        {GENDER_DISCOVERY_GROUPS.map((group) => (
          <label key={group}>
            <input
              type="checkbox"
              checked={value.genderGroups.includes(group)}
              onChange={(event) =>
                onChange({
                  ...value,
                  genderGroups: event.target.checked
                    ? [...value.genderGroups, group]
                    : value.genderGroups.filter((item) => item !== group),
                })
              }
            />
            Include me in discovery for {genderGroupLabel(group).toLowerCase()}
          </label>
        ))}
      </div>
      <p className="help">
        Your description is public to eligible people. Your selected routing
        groups stay private. Groups may overlap and are not a complete
        definition of identity. OpenMatch never infers them.
      </p>
    </fieldset>
  );
}

function PreferencesView({
  value,
  delivery,
  setBatchSize,
  suggestions,
  observationCount,
  clearObservations,
  onChange,
}: {
  value: Preferences;
  delivery: DeliverySettings;
  setBatchSize: (batchSize: DeliverySettings["batchSize"]) => Promise<void>;
  suggestions: WeightSuggestion[];
  observationCount: number;
  clearObservations: () => Promise<void>;
  onChange: (value: Preferences) => void;
}) {
  const setWeight = (key: keyof Preferences["weights"], weight: number) =>
    onChange({ ...value, weights: { ...value.weights, [key]: weight } });
  return (
    <div className="narrow">
      <p className="eyebrow">Preferences</p>
      <h1>What matters to you</h1>
      <p className="intro-copy">
        Hard boundaries filter first. Priorities only order people who are
        mutually eligible. Every change is yours.
      </p>
      <section className="settings-card">
        <h2>Finite batch size</h2>
        <p>
          Choose up to how many mutually eligible people appear at once. One to
          five is a product hypothesis, not a scientifically optimal number.
        </p>
        <div className="decision-row" aria-label="Introductions per batch">
          {([1, 2, 3, 4, 5] as const).map((size) => (
            <button
              key={size}
              aria-pressed={delivery.batchSize === size}
              className={delivery.batchSize === size ? "interest" : "pass"}
              onClick={() => void setBatchSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="help">
          Saved profiles are separate. Pause introductions any time from Your
          profile.
        </p>
      </section>
      <section className="settings-card">
        <h2>Mutual boundaries</h2>
        <label>
          Youngest age <strong>{value.ageMin}</strong>
          <input
            type="range"
            min="18"
            max={value.ageMax}
            value={value.ageMin}
            onChange={(event) =>
              onChange({ ...value, ageMin: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Oldest age <strong>{value.ageMax}</strong>
          <input
            type="range"
            min={value.ageMin}
            max="80"
            value={value.ageMax}
            onChange={(event) =>
              onChange({ ...value, ageMax: Number(event.target.value) })
            }
          />
        </label>
        <BoundaryFields value={value} onChange={onChange} />
      </section>
      <section className="settings-card">
        <h2>Distance</h2>
        <label>
          Ideal distance <strong>{value.idealDistanceKm} km</strong>
          <input
            type="range"
            min="1"
            max="30"
            value={value.idealDistanceKm}
            onChange={(event) =>
              onChange({
                ...value,
                idealDistanceKm: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Maximum distance <strong>{value.maximumDistanceKm} km</strong>
          <input
            type="range"
            min="15"
            max="100"
            value={value.maximumDistanceKm}
            onChange={(event) =>
              onChange({
                ...value,
                maximumDistanceKm: Number(event.target.value),
              })
            }
          />
        </label>
        <p className="help">
          Outside the maximum is a boundary. Inside it, nearer profiles receive
          a simple visible proximity score.
        </p>
      </section>
      <section className="settings-card">
        <h2>How to order eligible people</h2>
        {Object.entries(value.weights).map(([key, weight]) => {
          const index = PRIORITY_LEVELS.reduce(
            (best, level, i) =>
              Math.abs(level - weight) <
              Math.abs(PRIORITY_LEVELS[best] - weight)
                ? i
                : best,
            0,
          );
          return (
            <label key={key}>
              <span className="capitalize">{key}</span>
              <strong>{priorityLabel(weight)}</strong>
              <input
                type="range"
                min="0"
                max="3"
                value={index}
                onChange={(event) =>
                  setWeight(
                    key as keyof Preferences["weights"],
                    PRIORITY_LEVELS[Number(event.target.value)],
                  )
                }
              />
            </label>
          );
        })}
        <p className="help">
          These are relative priorities, not judgments of anyone’s worth.
        </p>
      </section>
      <section className="settings-card">
        <h2>Preference suggestions</h2>
        {suggestions.length === 0 ? (
          <p>
            Nothing suggested yet. The transparent learner waits for at least 20
            explicit decisions, including five Interested and five Pass choices.
          </p>
        ) : (
          suggestions.map((suggestion) => (
            <div className="suggestion" key={suggestion.factorId}>
              <p>
                <strong className="capitalize">{suggestion.factorId}</strong> ·{" "}
                {priorityLabel(suggestion.currentWeight)} →{" "}
                {priorityLabel(suggestion.suggestedWeight)} ·{" "}
                {suggestion.sampleSize} decisions · {suggestion.confidence}{" "}
                confidence
              </p>
              <p className="help">{suggestion.caveat}</p>
              <button
                onClick={() =>
                  onChange({
                    ...value,
                    weights: {
                      ...value.weights,
                      [suggestion.factorId]: nearestPriority(
                        suggestion.suggestedWeight,
                      ),
                    },
                  })
                }
              >
                Accept suggestion
              </button>
            </div>
          ))
        )}
        <p className="help">
          Decisions only. Messages, dwell time, taps, and photos are never
          learning inputs. Nothing changes automatically. {observationCount}{" "}
          decision {observationCount === 1 ? "example is" : "examples are"}{" "}
          currently stored for this purpose.
        </p>
        <button
          className="danger-secondary"
          disabled={observationCount === 0}
          onClick={() => void clearObservations()}
        >
          Clear learning examples
        </button>
      </section>
    </div>
  );
}

function sessionClientLabel(client: AccountSession["client"]) {
  if (client === "web") return "Web browser";
  if (client === "ios") return "iPhone or iPad app";
  if (client === "android") return "Android app";
  return "Earlier OpenMatch client";
}

function ProfileView({
  profile,
  saveProfile,
  accountStatus,
  reports,
  genderPreferencesConfigured,
  addReportUpdate,
  researchConsent,
  directoryConsent,
  setDirectoryConsent,
  sessions,
  emailVerification,
  notificationEmail,
  requestNotificationEmail,
  confirmNotificationEmail,
  removeNotificationEmail,
  requestEmailVerification,
  confirmEmail,
  changePassword,
  generateRecoveryCodes,
  revokeSession,
  setResearchConsent,
  setAccountStatus,
  exportData,
  deleteData,
  deleteAccount,
}: {
  profile: Profile;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  accountStatus: AccountStatus;
  reports: ReportRecord[];
  genderPreferencesConfigured: boolean;
  addReportUpdate: (
    reportId: number,
    kind: ReportUpdateKind,
    details: string,
  ) => Promise<void>;
  researchConsent: ResearchConsentReceipt | null;
  directoryConsent: DirectoryConsentReceipt | null;
  setDirectoryConsent: (participating: boolean) => Promise<void>;
  sessions: AccountSession[];
  emailVerification: EmailVerificationStatus | null;
  notificationEmail: NotificationEmailStatus | null;
  requestNotificationEmail?: (
    email: string,
    currentPassword: string,
  ) => Promise<void>;
  confirmNotificationEmail?: (
    code: string,
  ) => Promise<SecurityNotificationStatus>;
  removeNotificationEmail?: (
    currentPassword: string,
  ) => Promise<SecurityNotificationStatus>;
  requestEmailVerification?: () => Promise<void>;
  confirmEmail?: (code: string) => Promise<void>;
  changePassword?: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<SecurityNotificationStatus>;
  generateRecoveryCodes?: (currentPassword: string) => Promise<{
    codes: string[];
    createdAt: string;
    securityNotification: SecurityNotificationStatus;
  }>;
  revokeSession: (sessionId: string) => Promise<void>;
  setResearchConsent: (participating: boolean) => Promise<void>;
  setAccountStatus: (status: AccountStatus) => Promise<void>;
  exportData: () => Promise<void>;
  deleteData: () => Promise<void>;
  deleteAccount?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationNotice, setVerificationNotice] = useState<string | null>(
    null,
  );
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [backupEmail, setBackupEmail] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [reportUpdateId, setReportUpdateId] = useState<number | null>(null);
  const [reportUpdateKind, setReportUpdateKind] =
    useState<ReportUpdateKind>("additional_context");
  const [reportUpdateDetails, setReportUpdateDetails] = useState("");
  const [reportUpdateNotice, setReportUpdateNotice] = useState<string | null>(
    null,
  );
  const [reportUpdateError, setReportUpdateError] = useState<string | null>(
    null,
  );
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const draftValid =
    draft.name.trim().length > 0 &&
    draft.city.trim().length > 0 &&
    draft.bio.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    draft.promptAnswer.trim().length > 0 &&
    draft.values.length > 0 &&
    draft.gender.trim().length > 0 &&
    draft.genderGroups.length > 0 &&
    draft.age >= 18 &&
    draft.age <= 120;

  return (
    <div className="narrow">
      <p className="eyebrow">Your profile</p>
      <h1>
        {profile.name}, {profile.age}
      </h1>
      <p className="intro-copy">
        This is what another person sees after you satisfy each other’s
        boundaries.
      </p>
      <section className="settings-card">
        <div className="card-title">
          <h2>About you</h2>
          <button
            className="text-button"
            disabled={editing && !draftValid}
            onClick={async () => {
              if (editing) {
                await saveProfile({
                  name: draft.name.trim(),
                  age: draft.age,
                  city: draft.city.trim(),
                  pronouns: draft.pronouns.trim(),
                  gender: draft.gender.trim(),
                  genderGroups: draft.genderGroups,
                  intent: draft.intent,
                  readiness: draft.readiness,
                  bio: draft.bio.trim(),
                  prompt: draft.prompt.trim(),
                  promptAnswer: draft.promptAnswer.trim(),
                  values: draft.values,
                  lifestyle: draft.lifestyle,
                });
              }
              setEditing(!editing);
            }}
          >
            {editing ? "Save" : "Edit"}
          </button>
        </div>
        {editing ? (
          <div className="profile-fields">
            <label>
              Display name
              <input
                value={draft.name}
                maxLength={50}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label>
              Age
              <input
                type="number"
                min="18"
                max="120"
                value={draft.age}
                onChange={(event) =>
                  setDraft({ ...draft, age: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Approximate city or region
              <input
                value={draft.city}
                maxLength={80}
                onChange={(event) =>
                  setDraft({ ...draft, city: event.target.value })
                }
              />
            </label>
            <label>
              Pronouns <span className="optional">optional</span>
              <input
                value={draft.pronouns}
                maxLength={50}
                onChange={(event) =>
                  setDraft({ ...draft, pronouns: event.target.value })
                }
              />
            </label>
            <GenderDiscoveryFields value={draft} onChange={setDraft} />
            <label>
              Relationship intention
              <select
                value={draft.intent}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    intent: event.target.value as Profile["intent"],
                  })
                }
              >
                <option>Long-term relationship</option>
                <option>Long-term, open to short</option>
                <option>Still figuring it out</option>
              </select>
            </label>
            <label>
              Meeting readiness
              <select
                value={draft.readiness}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    readiness: event.target.value as Profile["readiness"],
                  })
                }
              >
                <option>Prefer to chat first</option>
                <option>Ready to meet in person</option>
              </select>
            </label>
            <label>
              Biography
              <textarea
                value={draft.bio}
                maxLength={500}
                onChange={(event) =>
                  setDraft({ ...draft, bio: event.target.value })
                }
              />
            </label>
            <MatchingProfileFields value={draft} onChange={setDraft} />
          </div>
        ) : (
          <>
            <p className="profile-meta">
              {profile.pronouns || "Pronouns not shown"} · {profile.gender} ·{" "}
              {profile.city} · {profile.intent}
            </p>
            <p className="readiness">{profile.readiness}</p>
            <p className="large-copy">{profile.bio}</p>
          </>
        )}
        <div className="prompt">
          <span>{profile.prompt}</span>
          <p>{profile.promptAnswer}</p>
        </div>
        <div className="chips">
          {profile.values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      </section>
      {emailVerification && confirmEmail && (
        <section className="settings-card">
          <h2>Email for account messages</h2>
          <p>
            <strong>{emailVerification.email}</strong>
          </p>
          {emailVerification.verifiedAt ? (
            <p role="status">
              Confirmed for account messages on{" "}
              {new Date(emailVerification.verifiedAt).toLocaleString()}.
              Confirmation proves access to this inbox—not identity.
            </p>
          ) : emailVerification.deliveryConfigured ? (
            <>
              <p>
                Enter the eight-digit code sent by OpenMatch. It expires after
                24 hours and works once. Never send it to another person.
              </p>
              <form
                className="profile-fields"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setVerificationError(null);
                  setVerificationNotice(null);
                  try {
                    await confirmEmail(verificationCode);
                    setVerificationCode("");
                    setVerificationNotice("Email confirmed.");
                  } catch (error) {
                    setVerificationError(
                      error instanceof ApiError &&
                        error.code === "invalid_verification_code"
                        ? "The code was not accepted or has expired."
                        : "The email could not be confirmed.",
                    );
                  }
                }}
              >
                <label>
                  Confirmation code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(
                        event.target.value.replace(/\D/g, "").slice(0, 8),
                      )
                    }
                  />
                </label>
                <button type="submit" disabled={verificationCode.length !== 8}>
                  Confirm email
                </button>
              </form>
              {requestEmailVerification && (
                <button
                  type="button"
                  onClick={async () => {
                    setVerificationError(null);
                    setVerificationNotice(null);
                    try {
                      await requestEmailVerification();
                      setVerificationNotice("A new code was sent.");
                    } catch (error) {
                      setVerificationError(
                        error instanceof ApiError &&
                          error.code === "verification_resend_too_soon"
                          ? "Please wait one minute before requesting another code."
                          : "A new code could not be sent.",
                      );
                    }
                  }}
                >
                  Send another code
                </button>
              )}
              {verificationNotice && <p role="status">{verificationNotice}</p>}
              {verificationError && <p role="alert">{verificationError}</p>}
            </>
          ) : (
            <p>
              Email delivery is not configured on this development service, so
              the address is not confirmed. A real-person deployment must
              configure encrypted SMTP delivery before relying on it.
            </p>
          )}
        </section>
      )}
      {notificationEmail &&
        requestNotificationEmail &&
        confirmNotificationEmail &&
        removeNotificationEmail && (
          <section className="settings-card">
            <h2>Backup security email</h2>
            <p>
              Add one independently confirmed inbox for the same sparse account
              security notices. It cannot sign in, recover the account, affect
              matching, or prove identity. OpenMatch still needs your current
              passphrase before adding, replacing, or removing it.
            </p>
            {notificationEmail.email ? (
              <>
                <p>
                  <strong>{notificationEmail.email}</strong> · Confirmed on{" "}
                  {new Date(notificationEmail.verifiedAt!).toLocaleString()}
                </p>
                <form
                  className="profile-fields"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setBackupError(null);
                    setBackupNotice(null);
                    if (!window.confirm("Remove the backup security email?"))
                      return;
                    try {
                      const notification =
                        await removeNotificationEmail(backupPassword);
                      setBackupPassword("");
                      setBackupNotice(
                        "Backup security email removed." +
                          securityNotice(notification),
                      );
                    } catch (error) {
                      setBackupError(
                        error instanceof ApiError &&
                          error.code === "invalid_current_password"
                          ? "The current passphrase was not accepted."
                          : "The backup security email could not be removed.",
                      );
                    }
                  }}
                >
                  <label>
                    Current passphrase
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={backupPassword}
                      maxLength={128}
                      onChange={(event) =>
                        setBackupPassword(event.target.value)
                      }
                    />
                  </label>
                  <button type="submit" disabled={!backupPassword}>
                    Remove backup email
                  </button>
                </form>
              </>
            ) : notificationEmail.pendingEmail ? (
              <form
                className="profile-fields"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBackupError(null);
                  setBackupNotice(null);
                  try {
                    const notification =
                      await confirmNotificationEmail(backupCode);
                    setBackupCode("");
                    setBackupNotice(
                      "Backup security email confirmed." +
                        securityNotice(notification),
                    );
                  } catch (error) {
                    setBackupError(
                      error instanceof ApiError &&
                        error.code === "invalid_verification_code"
                        ? "The code was not accepted or has expired."
                        : "The backup security email could not be confirmed.",
                    );
                  }
                }}
              >
                <p>
                  Enter the eight-digit code sent to{" "}
                  <strong>{notificationEmail.pendingEmail}</strong>.
                </p>
                <label>
                  Confirmation code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    value={backupCode}
                    onChange={(event) =>
                      setBackupCode(
                        event.target.value.replace(/\D/g, "").slice(0, 8),
                      )
                    }
                  />
                </label>
                <button type="submit" disabled={backupCode.length !== 8}>
                  Confirm backup email
                </button>
              </form>
            ) : (
              <form
                className="profile-fields"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBackupError(null);
                  setBackupNotice(null);
                  try {
                    await requestNotificationEmail(backupEmail, backupPassword);
                    setBackupEmail("");
                    setBackupPassword("");
                    setBackupNotice("A confirmation code was sent.");
                  } catch (error) {
                    setBackupError(
                      error instanceof ApiError &&
                        error.code === "invalid_current_password"
                        ? "The current passphrase was not accepted."
                        : error instanceof ApiError &&
                            error.code === "primary_email_unverified"
                          ? "Confirm the primary account email first."
                          : "The confirmation code could not be sent.",
                    );
                  }
                }}
              >
                <label>
                  Backup email
                  <input
                    type="email"
                    autoComplete="email"
                    value={backupEmail}
                    onChange={(event) => setBackupEmail(event.target.value)}
                  />
                </label>
                <label>
                  Current passphrase
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={backupPassword}
                    maxLength={128}
                    onChange={(event) => setBackupPassword(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={!backupEmail || !backupPassword}
                >
                  Send confirmation code
                </button>
              </form>
            )}
            {backupNotice && <p role="status">{backupNotice}</p>}
            {backupError && <p role="alert">{backupError}</p>}
          </section>
        )}
      {deleteAccount && (
        <section className="settings-card">
          <h2>Account matching</h2>
          <p>
            This is a separate, reversible choice. When enabled and your profile
            is Active, your chosen public profile can appear to mutually
            eligible accounts whose approximate region text exactly matches
            yours. Private preferences and one-sided decisions are not shown.
          </p>
          <div className="data-actions">
            <button
              aria-pressed={directoryConsent?.participating === true}
              disabled={
                directoryConsent?.participating !== true &&
                ((Boolean(emailVerification?.deliveryConfigured) &&
                  !emailVerification?.verifiedAt) ||
                  !profile.gender.trim() ||
                  profile.genderGroups.length === 0 ||
                  !genderPreferencesConfigured)
              }
              onClick={() =>
                void setDirectoryConsent(
                  !(directoryConsent?.participating === true),
                )
              }
            >
              {directoryConsent?.participating
                ? "Stop account matching"
                : "Enable account matching"}
            </button>
          </div>
          <p className="help" role="status">
            {directoryConsent?.participating &&
            (!profile.gender.trim() ||
              profile.genderGroups.length === 0 ||
              !genderPreferencesConfigured)
              ? "Participation is recorded, but you are excluded from matching until you finish gender discovery in Profile and Preferences."
              : !directoryConsent?.participating &&
                  (!profile.gender.trim() ||
                    profile.genderGroups.length === 0 ||
                    !genderPreferencesConfigured)
                ? "Finish gender discovery in Profile and Preferences before joining account matching."
                : emailVerification?.deliveryConfigured &&
                    !emailVerification.verifiedAt
                  ? "Confirm your email before joining account matching."
                  : directoryConsent
                    ? (directoryConsent.participating
                        ? "Enabled"
                        : "Disabled") +
                      " under " +
                      directoryConsent.noticeVersion +
                      "."
                    : "Disabled. No account-matching consent has been recorded."}
          </p>
        </section>
      )}
      {changePassword && (
        <section className="settings-card">
          <h2>Change passphrase</h2>
          <p>
            Enter your current passphrase, then choose at least 15 characters.
            Spaces and password managers are welcome; there are no symbol or
            periodic-change rules. A successful change signs out every other
            session and securely replaces this session.
          </p>
          <form
            className="profile-fields"
            onSubmit={async (event) => {
              event.preventDefault();
              setPasswordNotice(null);
              setPasswordError(null);
              if (newPassword !== confirmPassword) {
                setPasswordError("The new passphrases do not match.");
                return;
              }
              try {
                const notification = await changePassword(
                  currentPassword,
                  newPassword,
                );
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setPasswordNotice(
                  "Passphrase changed. Every other session was signed out." +
                    securityNotice(notification),
                );
              } catch (error) {
                setPasswordError(
                  error instanceof ApiError &&
                    error.code === "invalid_current_password"
                    ? "The current passphrase was not accepted."
                    : error instanceof ApiError &&
                        error.code === "common_password"
                      ? "Choose a less common passphrase."
                      : error instanceof ApiError &&
                          error.code === "password_unchanged"
                        ? "Choose a passphrase different from the current one."
                        : "The passphrase could not be changed.",
                );
              }
            }}
          >
            <label>
              Current passphrase
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                maxLength={128}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              New passphrase
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                minLength={15}
                maxLength={128}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Confirm new passphrase
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                minLength={15}
                maxLength={128}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={
                !currentPassword ||
                newPassword.length < 15 ||
                confirmPassword.length < 15
              }
            >
              Change passphrase
            </button>
          </form>
          {passwordNotice && <p role="status">{passwordNotice}</p>}
          {passwordError && <p role="alert">{passwordError}</p>}
        </section>
      )}
      {generateRecoveryCodes && (
        <section className="settings-card">
          <h2>Recovery codes</h2>
          <p>
            Recovery codes let you replace a forgotten passphrase without email.
            Each code works once, and creating a new set invalidates the old
            set. Keep them outside this device, ideally in a password manager.
            OpenMatch cannot restore lost codes.
          </p>
          {recoveryCodes.length ? (
            <div className="recovery-code-set" role="status">
              <strong>Copy these now. They will not be shown again.</strong>
              <ul>
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(recoveryCodes.join("\n"))
                }
              >
                Copy all codes
              </button>
              <button type="button" onClick={() => setRecoveryCodes([])}>
                I saved them—hide codes
              </button>
            </div>
          ) : (
            <form
              className="profile-fields"
              onSubmit={async (event) => {
                event.preventDefault();
                setRecoveryError(null);
                setRecoveryNotice(null);
                try {
                  const result = await generateRecoveryCodes(recoveryPassword);
                  setRecoveryPassword("");
                  setRecoveryCodes(result.codes);
                  setRecoveryNotice(
                    "Every older recovery code is now invalid." +
                      securityNotice(result.securityNotification),
                  );
                } catch (error) {
                  setRecoveryError(
                    error instanceof ApiError &&
                      error.code === "invalid_current_password"
                      ? "The current passphrase was not accepted."
                      : "Recovery codes could not be created.",
                  );
                }
              }}
            >
              <label>
                Current passphrase
                <input
                  type="password"
                  autoComplete="current-password"
                  value={recoveryPassword}
                  maxLength={128}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                />
              </label>
              <button type="submit" disabled={!recoveryPassword}>
                Create new recovery codes
              </button>
            </form>
          )}
          {recoveryNotice && <p role="status">{recoveryNotice}</p>}
          {recoveryError && <p role="alert">{recoveryError}</p>}
        </section>
      )}
      <section className="settings-card">
        <h2>Active sessions</h2>
        <p>
          See where your account is signed in and end any session you no longer
          recognize. OpenMatch stores only the broad client type—not an IP
          address, device fingerprint, activity history, or exact device model.
        </p>
        {sessions.length ? (
          <div className="report-history">
            {sessions.map((session) => {
              const label = sessionClientLabel(session.client);
              return (
                <div key={session.id}>
                  <strong>
                    {label}
                    {session.current ? " · This session" : ""}
                  </strong>
                  <span>
                    Started {new Date(session.createdAt).toLocaleString()} ·
                    Expires {new Date(session.expiresAt).toLocaleDateString()}
                  </span>
                  {!session.current && (
                    <button
                      aria-label={`Revoke ${label} session started ${new Date(session.createdAt).toLocaleString()}`}
                      onClick={() => void revokeSession(session.id)}
                    >
                      Sign out this session
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="help">Sign in with an account to manage sessions.</p>
        )}
      </section>
      <section className="settings-card">
        <h2>Optional research</h2>
        <p>
          Research participation is separate from using OpenMatch and defaults
          off. No study is active in this prototype, and this choice never
          changes your introductions.
        </p>
        <div className="data-actions">
          <button
            aria-pressed={researchConsent?.participating === true}
            onClick={() =>
              void setResearchConsent(
                !(researchConsent?.participating === true),
              )
            }
          >
            {researchConsent?.participating
              ? "Withdraw research consent"
              : "Opt in to future prototype research"}
          </button>
        </div>
        <p className="help" role="status">
          {researchConsent
            ? `${researchConsent.participating ? "Opted in" : "Opted out"} under ${researchConsent.noticeVersion}.`
            : "Not enrolled. No research consent has been recorded."}
        </p>
      </section>
      <section className="settings-card">
        <h2>Your safety reports</h2>
        <p>
          Reports are private. You can append context, correct the record, or
          request withdrawal without erasing the original. This prototype has no
          staffed review operation, response-time promise, or moderation
          decision to appeal.
        </p>
        {reports.length ? (
          <div className="report-history">
            {reports.map((report) => (
              <div key={report.id}>
                <strong>Report #{report.id}</strong>
                <span>
                  {report.reason.replaceAll("_", " ")} · {report.status} ·{" "}
                  {new Date(report.createdAt).toLocaleString()}
                </span>
                {report.updates.map((update) => (
                  <span key={update.id}>
                    {update.kind.replaceAll("_", " ")} ·{" "}
                    {new Date(update.createdAt).toLocaleString()}:{" "}
                    {update.details}
                  </span>
                ))}
                <button
                  className="text-button"
                  onClick={() => {
                    setReportUpdateId(report.id);
                    setReportUpdateDetails("");
                    setReportUpdateNotice(null);
                    setReportUpdateError(null);
                  }}
                >
                  Add context or correction
                </button>
                {reportUpdateId === report.id && (
                  <form
                    className="safety-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setReportUpdateError(null);
                      try {
                        await addReportUpdate(
                          report.id,
                          reportUpdateKind,
                          reportUpdateDetails,
                        );
                        setReportUpdateId(null);
                        setReportUpdateDetails("");
                        setReportUpdateNotice(
                          `Update added to report #${report.id}.`,
                        );
                      } catch (error) {
                        setReportUpdateError(
                          operationLimitMessage(
                            error,
                            "The report update could not be added. Please retry.",
                          ),
                        );
                      }
                    }}
                  >
                    <label>
                      Update type
                      <select
                        value={reportUpdateKind}
                        onChange={(event) =>
                          setReportUpdateKind(
                            event.target.value as ReportUpdateKind,
                          )
                        }
                      >
                        <option value="additional_context">
                          Additional context
                        </option>
                        <option value="correction">Correction</option>
                        <option value="withdrawal_request">
                          Request withdrawal
                        </option>
                      </select>
                    </label>
                    <label>
                      What should be added to the record?
                      <textarea
                        maxLength={2000}
                        required
                        value={reportUpdateDetails}
                        onChange={(event) =>
                          setReportUpdateDetails(event.target.value)
                        }
                      />
                    </label>
                    <p className="help">
                      An update is append-only. A withdrawal request records
                      your request but does not silently delete safety data.
                    </p>
                    <div className="button-row">
                      <button
                        type="submit"
                        disabled={!reportUpdateDetails.trim()}
                      >
                        Add to report
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setReportUpdateId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    {reportUpdateError && (
                      <p role="alert" className="error">
                        {reportUpdateError}
                      </p>
                    )}
                  </form>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p>No reports submitted.</p>
        )}
        {reportUpdateNotice && <p role="status">{reportUpdateNotice}</p>}
      </section>
      <section className="settings-card">
        <h2>Privacy</h2>
        <p>
          Your precise location, legal name, contacts, activity time, and
          preference decisions are never displayed.
        </p>
        {deleteAccount && (
          <p className="help">
            Active means your chosen public profile may be shown to mutually
            eligible people whose approximate city or region exactly matches
            yours. Paused or Hidden removes you from new introductions. The
            prototype does not geocode or claim an exact distance.
          </p>
        )}
        <div className="data-actions">
          {accountStatus === "active" ? (
            <>
              <button onClick={() => void setAccountStatus("paused")}>
                Pause introductions
              </button>
              <button onClick={() => void setAccountStatus("hidden")}>
                Hide my profile
              </button>
            </>
          ) : (
            <button onClick={() => void setAccountStatus("active")}>
              Resume and show profile
            </button>
          )}
          <button onClick={() => void exportData()}>Export my data</button>
          <button className="danger" onClick={() => void deleteData()}>
            Delete local data
          </button>
          {deleteAccount && (
            <button className="danger" onClick={() => void deleteAccount()}>
              Delete account permanently
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function CandidateSafety({
  name,
  notice,
  block,
  report,
}: {
  name: string;
  notice: string | null;
  block: () => Promise<void>;
  report: (reason: ReportReason, details: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="candidate-safety">
      {notice && <p role="status">{notice}</p>}
      <button className="safety-toggle" onClick={() => setOpen(!open)}>
        {open ? "Close safety options" : "Safety options"}
      </button>
      {open && (
        <div className="safety-form">
          <p>
            You can report a concern without notifying {name}. Blocking removes
            them immediately.
          </p>
          <label htmlFor="candidate-report-reason">Reason</label>
          <select
            id="candidate-report-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason)}
          >
            <option value="harassment">Harassment</option>
            <option value="scam">Scam</option>
            <option value="impersonation">Impersonation</option>
            <option value="offline_safety">Offline safety</option>
            <option value="other">Other</option>
          </select>
          <label htmlFor="candidate-report-details">
            Details <span>optional</span>
          </label>
          <textarea
            id="candidate-report-details"
            value={reportDetails}
            maxLength={2000}
            onChange={(event) => setReportDetails(event.target.value)}
          />
          <div>
            <button
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await report(reason, reportDetails.trim());
                  setReportDetails("");
                  setOpen(false);
                } catch {
                  // The parent keeps the form open and presents the error.
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Submit report
            </button>
            <button className="danger" onClick={() => void block()}>
              Block {name}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionsView({
  connections,
  connection,
  selectConnection,
  messages,
  notice,
  draft,
  setDraft,
  send,
  unmatch,
  closePolitely,
  setMuted,
  setMeetingPreference,
  block,
  report,
}: {
  connections: Connection[];
  connection?: Connection;
  selectConnection: (connectionId: string) => void;
  messages: Message[];
  notice: string | null;
  draft: string;
  setDraft: (value: string) => void;
  send: () => void | Promise<void>;
  unmatch: () => Promise<void>;
  closePolitely: () => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  setMeetingPreference: (
    value: "not_asked" | "not_yet" | "open_to_plan",
  ) => Promise<void>;
  block: () => Promise<void>;
  report: (reason: ReportReason, details: string) => Promise<void>;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportDetails, setReportDetails] = useState("");
  if (!connection)
    return (
      <div className="empty">
        <div className="empty-mark">○</div>
        <h2>No connections yet</h2>
        <p>A connection appears only after mutual interest.</p>
      </div>
    );
  const name = connection.profile?.name ?? "Connection";
  return (
    <div className="narrow">
      <p className="eyebrow">
        {connections.length === 1 ? "Connection" : "Connections"}
      </p>
      <h1>{name}</h1>
      <p className="intro-copy">
        You both expressed interest. Messages are text-only and have no read
        receipts.
      </p>
      {connections.length > 1 && (
        <div className="connection-picker" aria-label="Choose a connection">
          {connections.map((item) => (
            <button
              key={item.id}
              aria-pressed={item.id === connection.id}
              onClick={() => selectConnection(item.id)}
            >
              {item.profile?.name ?? "Connection"}
            </button>
          ))}
        </div>
      )}
      <button
        className="text-button"
        onClick={() => {
          if (
            window.confirm(
              `Send this message and close the conversation?\n\n“${POLITE_CLOSE_MESSAGE}”`,
            )
          )
            void closePolitely();
        }}
      >
        Close politely with a standard message
      </button>
      <button
        className="text-button"
        aria-pressed={connection.muted}
        onClick={() => void setMuted(!connection.muted)}
      >
        {connection.muted ? "Unmute conversation" : "Mute conversation"}
      </button>
      <p className="help">
        {connection.muted
          ? "Muted. Future message notifications would be suppressed. Messages remain available."
          : "This prototype sends no notifications yet; the preference is stored for future delivery."}
      </p>
      <section className="settings-card meeting-card">
        <p className="eyebrow">Optional next step</p>
        <h2>Would you like to plan a first meeting?</h2>
        <p>
          This private, reversible preference does not affect matching and is
          not a claim that a date happened. The prototype does not send it to
          the other person.
        </p>
        <div className="setting-actions" aria-label="Meeting preference">
          <button
            aria-pressed={connection.meetingPreference === "not_yet"}
            onClick={() => void setMeetingPreference("not_yet")}
          >
            Not yet
          </button>
          <button
            aria-pressed={connection.meetingPreference === "open_to_plan"}
            onClick={() => void setMeetingPreference("open_to_plan")}
          >
            Open to planning
          </button>
        </div>
        {connection.meetingPreference !== "not_asked" && (
          <p role="status" className="help">
            {connection.meetingPreference === "open_to_plan"
              ? "Saved privately: open to planning."
              : "Saved privately: not yet."}
          </p>
        )}
        <ul className="meeting-safety">
          <li>Choose a busy public place.</li>
          <li>Keep control of your transport and exact location.</li>
          <li>Tell someone you trust where you are going.</li>
        </ul>
      </section>
      <section className="settings-card conversation">
        <div className="connection-head">
          <div>
            <h2>
              {name}
              {connection.profile ? `, ${connection.profile.age}` : ""}
            </h2>
            <p>Mutual connection</p>
          </div>
          <details>
            <summary>Safety</summary>
            <button
              onClick={() => {
                if (window.confirm("Unmatch and close this conversation?"))
                  void unmatch();
              }}
            >
              Unmatch
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Block this person and remove the conversation?",
                  )
                )
                  void block();
              }}
            >
              Block
            </button>
            <button onClick={() => setReportOpen(!reportOpen)}>Report</button>
          </details>
        </div>
        {notice && <p role="status">{notice}</p>}
        {reportOpen && (
          <div className="conversation-report safety-form">
            <p>
              Your report is not shown to {name}. Include only information that
              helps explain the concern.
            </p>
            <label htmlFor="connection-report-reason">Reason</label>
            <select
              id="connection-report-reason"
              value={reportReason}
              onChange={(event) =>
                setReportReason(event.target.value as ReportReason)
              }
            >
              <option value="harassment">Harassment</option>
              <option value="scam">Scam</option>
              <option value="impersonation">Impersonation</option>
              <option value="offline_safety">Offline safety</option>
              <option value="other">Other</option>
            </select>
            <label htmlFor="connection-report-details">
              Details <span>optional</span>
            </label>
            <textarea
              id="connection-report-details"
              value={reportDetails}
              maxLength={2000}
              onChange={(event) => setReportDetails(event.target.value)}
            />
            <div>
              <button
                onClick={async () => {
                  try {
                    await report(reportReason, reportDetails.trim());
                    setReportDetails("");
                    setReportOpen(false);
                  } catch {
                    // The parent keeps the form open and presents the error.
                  }
                }}
              >
                Submit report
              </button>
              <button onClick={() => setReportOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="messages">
          {messages.length === 0 ? (
            <p className="message-empty">
              Start with something from their profile—not a generated line.
            </p>
          ) : (
            messages.map((message) => {
              const sent = message.senderId === "me";
              const author = sent ? "You" : name;
              return (
                <div
                  className={"bubble " + (sent ? "sent" : "received")}
                  aria-label={author + ": " + message.text}
                  key={message.id}
                >
                  <span className="message-author">{author}</span>
                  <span>{message.text}</span>
                </div>
              );
            })
          )}
        </div>
        {connection.profile && (
          <div className="starter">
            <button
              className="text-button"
              onClick={() => setDraft(conversationStarter(connection.profile!))}
            >
              Start from their profile
            </button>
            <p>
              Copies a simple profile-specific draft into the composer. Review
              and edit it yourself before sending.
            </p>
          </div>
        )}
        <div className="composer">
          <input
            aria-label={`Message ${name}`}
            value={draft}
            maxLength={2000}
            placeholder="Write a message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void send()}
          />
          <button onClick={() => void send()}>Send</button>
        </div>
      </section>
    </div>
  );
}

function AboutView({
  transparency,
  authenticated,
}: {
  transparency: TransparencyVersion | null;
  authenticated: boolean;
}) {
  return (
    <div className="narrow">
      <p className="eyebrow">Public method</p>
      <h1>Understand every introduction.</h1>
      <p className="intro-copy">
        The score helps order mutually eligible people. It does not predict
        love, attraction, or relationship success.
      </p>
      <section className="method-list">
        <div>
          <b>1</b>
          <h2>Boundaries first</h2>
          <p>
            Age, distance, intent, and lifestyle boundaries must work for both
            people.
          </p>
        </div>
        <div>
          <b>2</b>
          <h2>Two visible scores</h2>
          <p>
            Each person’s chosen priorities create a directed fit. Their
            harmonic mean prevents one-sided fit from being hidden.
          </p>
        </div>
        <div>
          <b>3</b>
          <h2>One public lottery place</h2>
          <p>
            A five-person batch reserves one place for a reproducible weekly
            lottery among eligible people. The label, seed, and probability are
            visible; the score never changes.
          </p>
        </div>
        <div>
          <b>4</b>
          <h2>Human judgment</h2>
          <p>
            You see the person and reasoning, then decide. Feedback can suggest
            preference edits but never changes them silently.
          </p>
        </div>
      </section>
      <div className="version">
        Algorithm {transparency?.matching ?? ALGORITHM_VERSION} · Deterministic
        · No hidden factors · Prototype
      </div>
      <div className="version">
        {transparency?.deployedCommit ? (
          <a
            href={`https://github.com/jannis-cmd/openmatch/commit/${transparency.deployedCommit}`}
            target="_blank"
            rel="noreferrer"
          >
            Deployed code {transparency.deployedCommit.slice(0, 12)} ↗
          </a>
        ) : (
          "Deployed code: unpinned development build"
        )}
      </div>
      <ScoreCalculator />
      <section className="transparency-links settings-card">
        <h2>Inspect the work</h2>
        <p>
          The objective is useful introductions, not engagement. Candidate-side
          personal weights may be private from another user, but they are never
          hidden system factors.
        </p>
        <a
          href="https://github.com/jannis-cmd/openmatch/blob/main/packages/matching/src/index.ts"
          target="_blank"
          rel="noreferrer"
        >
          Matching source code ↗
        </a>
        <a
          href="https://github.com/jannis-cmd/openmatch/blob/main/research/EVIDENCE_REGISTER.md"
          target="_blank"
          rel="noreferrer"
        >
          Evidence register ↗
        </a>
        <a
          href="https://github.com/jannis-cmd/openmatch/blob/main/docs/ALGORITHM_DECISIONS.md"
          target="_blank"
          rel="noreferrer"
        >
          Algorithm decisions and changes ↗
        </a>
        <a
          href="https://github.com/jannis-cmd/openmatch/blob/main/docs/DATA_INVENTORY.json"
          target="_blank"
          rel="noreferrer"
        >
          Machine-readable data inventory ↗
        </a>
        <h2>Known limits</h2>
        <p>
          This prototype cannot predict attraction, love, relationship success,
          or safety. Its small demo pool is not evidence of fairness or
          effectiveness. Those claims require prospective and independent
          evaluation.
        </p>
        {authenticated ? (
          <p>
            This account uses an isolated application-data store, a random
            expiring session, and a scrypt-protected passphrase. Completed
            active accounts can currently meet only when their self-entered
            approximate region text matches exactly; the service does not
            geocode or estimate distance. Passkeys, email-delivery monitoring,
            provider-backed recovery notifications, and an independent security
            review are still required before any real-person pilot.
          </p>
        ) : (
          <p>
            The temporary bearer token only gates this shared local demo. It
            does not verify identity or isolate one person’s data from another
            client. Do not use this demo with real profiles.
          </p>
        )}
      </section>
      <section className="transparency-links settings-card">
        <h2>Safer dating</h2>
        <p>
          No app can guarantee safety. Keep personal details private until you
          trust someone. For a first meeting, choose a busy public place, tell a
          trusted person your plans, control your own transport, and leave if
          you feel uncomfortable.
        </p>
        <p>
          Never send money, gift cards, bank transfers, or cryptocurrency to an
          online love interest. If someone asks, stop contact and report them.
        </p>
        <p>
          If you are in immediate danger, contact your local emergency services.
          OpenMatch cannot provide emergency help.
        </p>
        <a
          href="https://rainn.org/strategies-to-reduce-risk-increase-safety/tips-for-safer-dating-online-and-in-person/"
          target="_blank"
          rel="noreferrer"
        >
          RAINN safer-dating guidance ↗
        </a>
        <a
          href="https://consumer.ftc.gov/articles/what-know-about-romance-scams"
          target="_blank"
          rel="noreferrer"
        >
          FTC romance-scam guidance ↗
        </a>
      </section>
      <SafetySupportCard />
    </div>
  );
}

function SafetySupportCard() {
  return (
    <section className="support-card" aria-labelledby="support-heading">
      <p className="eyebrow">Help without reporting here</p>
      <h2 id="support-heading">Independent support in Switzerland</h2>
      <p>
        You do not need to file an OpenMatch report or tell us what happened.
        OpenMatch cannot provide emergency help.
      </p>
      <div className="support-grid">
        <a href="tel:117">
          <strong>Immediate danger · Police 117</strong>
          <span>Call Swiss police now.</span>
        </a>
        <a href="tel:144">
          <strong>Medical emergency · 144</strong>
          <span>Call Swiss emergency medical services.</span>
        </a>
        <a href="tel:142">
          <strong>Victim support · 142</strong>
          <span>
            Free, confidential and anonymous support. This is not an emergency
            number.
          </span>
        </a>
        <a
          href="https://www.opferhilfe-schweiz.ch/en/"
          target="_blank"
          rel="noreferrer"
        >
          <strong>Victim Support Switzerland ↗</strong>
          <span>Find professional counselling and local services.</span>
        </a>
      </div>
      <p className="support-caveat">
        These numbers are for Switzerland. Elsewhere, use local emergency and
        victim-support services. Calling or opening another site leaves
        OpenMatch and may appear in device, phone-provider, or website records.
        OpenMatch sends no report or profile data when you use these links.
      </p>
    </section>
  );
}

function ScoreCalculator() {
  const [yourFit, setYourFit] = useState(80);
  const [theirFit, setTheirFit] = useState(60);
  const [boundaryWorks, setBoundaryWorks] = useState(true);
  const explanation = explainMatch({
    boundaries: [
      {
        id: "synthetic-boundary",
        label: "Synthetic mutual boundary",
        satisfiedForA: boundaryWorks,
        satisfiedForB: boundaryWorks,
      },
    ],
    factors: [
      {
        id: "synthetic-fit",
        label: "Synthetic fit",
        compatibilityA: yourFit / 100,
        compatibilityB: theirFit / 100,
        weightA: 1,
        weightB: 1,
      },
    ],
  });
  const reciprocal = Math.round(explanation.reciprocalFit * 100);
  const final = Math.round(explanation.finalScore * 100);

  return (
    <section className="calculator settings-card">
      <p className="eyebrow">Try it locally</p>
      <h2>Reciprocal score calculator</h2>
      <p>
        These are synthetic values. Move either side to see why a high one-sided
        fit cannot hide a low one. Nothing is sent to the server.
      </p>
      <label htmlFor="your-directed-fit">
        Your directed fit <strong>{yourFit}%</strong>
      </label>
      <input
        id="your-directed-fit"
        type="range"
        min="0"
        max="100"
        value={yourFit}
        onChange={(event) => setYourFit(Number(event.target.value))}
      />
      <label htmlFor="their-directed-fit">
        Their directed fit <strong>{theirFit}%</strong>
      </label>
      <input
        id="their-directed-fit"
        type="range"
        min="0"
        max="100"
        value={theirFit}
        onChange={(event) => setTheirFit(Number(event.target.value))}
      />
      <label className="calculator-check">
        <input
          type="checkbox"
          checked={boundaryWorks}
          onChange={(event) => setBoundaryWorks(event.target.checked)}
        />
        Mutual boundaries are satisfied
      </label>
      <div className="calculator-result" aria-live="polite">
        <div>
          <span>Reciprocal fit</span>
          <strong>{reciprocal}%</strong>
        </div>
        <div>
          <span>Final score</span>
          <strong>{final}%</strong>
        </div>
      </div>
      <p className="calculator-formula">
        {yourFit + theirFit === 0
          ? "When both directed fits are 0, reciprocal fit is defined as 0."
          : `Harmonic mean: 2 × ${yourFit} × ${theirFit} ÷ (${yourFit} + ${theirFit}) = ${reciprocal}.`}{" "}
        {!boundaryWorks && "A failed boundary makes the final score 0."}
      </p>
    </section>
  );
}
