"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  type AccountStatus,
  type Connection,
  type Message,
  type ReportReason,
} from "@openmatch/api-client";
import {
  ALGORITHM_VERSION,
  defaultPreferences,
  demoUser,
  nearestPriority,
  PRIORITY_LEVELS,
  priorityLabel,
  type Introduction,
  type Preferences,
  type Profile,
  type WeightSuggestion,
} from "@openmatch/matching";

type View = "today" | "connections" | "preferences" | "profile" | "about";
type SiteView = "landing" | "sign-in" | "app";

export default function Home() {
  const [siteView, setSiteView] = useState<SiteView>("landing");
  useEffect(() => {
    if (window.sessionStorage.getItem("openmatch-demo-session") === "active") {
      setSiteView("app");
    }
  }, []);

  const openApp = () => {
    window.sessionStorage.setItem("openmatch-demo-session", "active");
    setSiteView("app");
  };

  const exitApp = () => {
    window.sessionStorage.removeItem("openmatch-demo-session");
    setSiteView("landing");
  };

  if (siteView === "landing") {
    return (
      <LandingPage signIn={() => setSiteView("sign-in")} tryDemo={openApp} />
    );
  }

  if (siteView === "sign-in") {
    return (
      <SignInPage back={() => setSiteView("landing")} continueToApp={openApp} />
    );
  }

  return <AppExperience exit={exitApp} />;
}

function AppExperience({ exit }: { exit: () => void }) {
  const api = useMemo(
    () =>
      createApiClient(
        process.env.NEXT_PUBLIC_OPENMATCH_API_URL ?? "http://127.0.0.1:4000",
      ),
    [],
  );
  const [view, setView] = useState<View>("today");
  const [preferences, setPreferences] = useState<Preferences>(
    structuredClone(defaultPreferences),
  );
  const [profile, setProfile] = useState<Profile>(demoUser);
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [details, setDetails] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WeightSuggestion[]>([]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active");
  const current = introductions[0];
  const connected = connections.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        nextProfile,
        nextPreferences,
        nextIntroductions,
        nextConnections,
        onboarding,
        nextSuggestions,
        nextAccountStatus,
      ] = await Promise.all([
        api.profile(),
        api.preferences(),
        api.introductions(),
        api.connections(),
        api.onboarding(),
        api.preferenceSuggestions(),
        api.accountStatus(),
      ]);
      setProfile(nextProfile);
      setPreferences(nextPreferences);
      setIntroductions(nextIntroductions.items);
      setConnections(nextConnections.items);
      setOnboarded(onboarding.complete);
      setSuggestions(nextSuggestions.items);
      setAccountStatus(nextAccountStatus.status);
      if (nextConnections.items[0])
        setMessages((await api.messages(nextConnections.items[0].id)).items);
      else setMessages([]);
    } catch {
      setError(
        "The local API is unavailable. Start it with pnpm dev, then retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const savePreferences = async (next: Preferences) => {
    setPreferences(next);
    try {
      await api.updatePreferences(next);
      setIntroductions((await api.introductions()).items);
      setSuggestions((await api.preferenceSuggestions()).items);
    } catch {
      setError("Preferences could not be saved.");
    }
  };

  const decide = async (decision: "interested" | "passed") => {
    if (!current) return;
    try {
      await api.decide(current.profile.id, decision);
      setDetails(false);
      await load();
    } catch {
      setError("Your decision could not be saved. Please retry.");
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={exit} aria-label="OpenMatch home">
          OpenMatch
        </button>
        <span className="nonprofit">Nonprofit · Open source</span>
      </header>
      <div className="workspace">
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
              label={`Connections${connected ? " · 1" : ""}`}
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
            <OnboardingView
              profile={profile}
              preferences={preferences}
              onProfile={setProfile}
              onPreferences={setPreferences}
              complete={async () => {
                try {
                  const saved = await api.updateProfile({
                    name: profile.name.trim(),
                    age: profile.age,
                    city: profile.city.trim(),
                    pronouns: profile.pronouns.trim(),
                    intent: profile.intent,
                    bio: profile.bio.trim(),
                  });
                  await api.updatePreferences(preferences);
                  await api.completeOnboarding();
                  setProfile(saved);
                  await load();
                } catch {
                  setError(
                    "Setup could not be saved. Check the fields and retry.",
                  );
                }
              }}
            />
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
                      <p className="eyebrow">Your introductions</p>
                      <h1>
                        {current
                          ? `${introductions.length} remaining`
                          : "You’re all caught up"}
                      </h1>
                    </div>
                    <p className="calm-note">A finite set. Take your time.</p>
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
                              {current.profile.city}
                            </p>
                          </div>
                          <p className="intent">{current.profile.intent}</p>
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
                          </div>
                        )}
                        <div className="decision-row">
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
                              await api.block(current.profile.id);
                              await load();
                            }
                          }}
                          report={async (reason, reportDetails) => {
                            const result = await api.report(
                              current.profile.id,
                              reason,
                              reportDetails,
                            );
                            setNotice(
                              `Report received. Reference status: ${result.status}.`,
                            );
                          }}
                        />
                      </aside>
                    </div>
                  ) : (
                    <div className="empty">
                      <div className="empty-mark">✓</div>
                      <h2>That’s the whole set.</h2>
                      <p>
                        No endless feed. New mutually eligible introductions
                        arrive Thursday.
                      </p>
                      <button
                        onClick={async () => {
                          await api.reset();
                          await load();
                        }}
                      >
                        Start over
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "preferences" && (
                <PreferencesView
                  value={preferences}
                  suggestions={suggestions}
                  onChange={(next) => void savePreferences(next)}
                />
              )}
              {view === "connections" && (
                <ConnectionsView
                  connection={connections[0]}
                  messages={messages}
                  notice={notice}
                  draft={draft}
                  setDraft={setDraft}
                  send={async () => {
                    const text = draft.trim();
                    if (!text || !connections[0]) return;
                    try {
                      const message = await api.sendMessage(
                        connections[0].id,
                        text,
                      );
                      setMessages((previous) => [...previous, message]);
                      setDraft("");
                    } catch {
                      setError("Message could not be sent.");
                    }
                  }}
                  unmatch={async () => {
                    if (connections[0]) {
                      await api.unmatch(connections[0].id);
                      await load();
                    }
                  }}
                  block={async () => {
                    if (connections[0]) {
                      await api.block(connections[0].profileId);
                      await load();
                    }
                  }}
                  report={async () => {
                    if (connections[0]) {
                      const result = await api.report(
                        connections[0].profileId,
                        "other",
                        "Submitted from the prototype safety menu.",
                      );
                      setNotice(
                        `Report received. Reference status: ${result.status}.`,
                      );
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
                      await api.deleteAccountData();
                      await load();
                    }
                  }}
                />
              )}
              {view === "about" && <AboutView />}
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

function LandingPage({
  signIn,
  tryDemo,
}: {
  signIn: () => void;
  tryDemo: () => void;
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
          <button className="primary-action" onClick={tryDemo}>
            Try the private demo
          </button>
          <a className="text-action" href="#how">
            See how matching works <span aria-hidden="true">↓</span>
          </a>
        </div>
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

      <section className="final-callout">
        <Mark />
        <h2>A calmer way to meet.</h2>
        <p>
          The first prototype is local, transparent, and intentionally small.
        </p>
        <button className="primary-action" onClick={tryDemo}>
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
      title: "Add real-world context",
      copy: "Distance helps order eligible people, but popularity and payment never do.",
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
  continueToApp,
}: {
  back: () => void;
  continueToApp: () => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <main className="sign-in-shell">
      <button className="sign-in-brand" onClick={back}>
        <Mark /> OpenMatch
      </button>
      <form
        className="sign-in-card"
        onSubmit={(event) => {
          event.preventDefault();
          continueToApp();
        }}
      >
        <p className="landing-eyebrow">Private prototype</p>
        <h1>Welcome back.</h1>
        <p>
          Account authentication is not connected yet. Your email stays in this
          browser and opens the local demonstration only.
        </p>
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
        <button className="primary-action" type="submit">
          Continue to the demo
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

function OnboardingView({
  profile,
  preferences,
  onProfile,
  onPreferences,
  complete,
}: {
  profile: Profile;
  preferences: Preferences;
  onProfile: (value: Profile) => void;
  onPreferences: (value: Preferences) => void;
  complete: () => Promise<void>;
}) {
  const valid =
    profile.name.trim().length > 0 &&
    profile.city.trim().length > 0 &&
    profile.bio.trim().length > 0 &&
    profile.age >= 18 &&
    profile.age <= 120;
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
          About you
          <textarea
            value={profile.bio}
            maxLength={500}
            onChange={(event) =>
              onProfile({ ...profile, bio: event.target.value })
            }
          />
        </label>
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
        <button
          className="interest"
          disabled={!valid}
          onClick={() => void complete()}
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

function PreferencesView({
  value,
  suggestions,
  onChange,
}: {
  value: Preferences;
  suggestions: WeightSuggestion[];
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
          learning inputs. Nothing changes automatically.
        </p>
      </section>
    </div>
  );
}

function ProfileView({
  profile,
  saveProfile,
  accountStatus,
  setAccountStatus,
  exportData,
  deleteData,
}: {
  profile: Profile;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  accountStatus: AccountStatus;
  setAccountStatus: (status: AccountStatus) => Promise<void>;
  exportData: () => Promise<void>;
  deleteData: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const draftValid =
    draft.name.trim().length > 0 &&
    draft.city.trim().length > 0 &&
    draft.bio.trim().length > 0 &&
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
                  intent: draft.intent,
                  bio: draft.bio.trim(),
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
              Biography
              <textarea
                value={draft.bio}
                maxLength={500}
                onChange={(event) =>
                  setDraft({ ...draft, bio: event.target.value })
                }
              />
            </label>
          </div>
        ) : (
          <>
            <p className="profile-meta">
              {profile.pronouns || "Pronouns not shown"} · {profile.city} ·{" "}
              {profile.intent}
            </p>
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
      <section className="settings-card">
        <h2>Privacy</h2>
        <p>
          Your precise location, legal name, contacts, activity time, and
          preference decisions are never displayed.
        </p>
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
  connection,
  messages,
  notice,
  draft,
  setDraft,
  send,
  unmatch,
  block,
  report,
}: {
  connection?: Connection;
  messages: Message[];
  notice: string | null;
  draft: string;
  setDraft: (value: string) => void;
  send: () => void | Promise<void>;
  unmatch: () => Promise<void>;
  block: () => Promise<void>;
  report: () => Promise<void>;
}) {
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
      <p className="eyebrow">Connection</p>
      <h1>{name}</h1>
      <p className="intro-copy">
        You both expressed interest. Messages are text-only and have no read
        receipts.
      </p>
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
            <button onClick={() => void unmatch()}>Unmatch</button>
            <button onClick={() => void block()}>Block</button>
            <button onClick={() => void report()}>Report</button>
          </details>
        </div>
        {notice && <p role="status">{notice}</p>}
        <div className="messages">
          {messages.length === 0 ? (
            <p className="message-empty">
              Start with something from their profile—not a generated line.
            </p>
          ) : (
            messages.map((message) => (
              <p className="bubble" key={message.id}>
                {message.text}
              </p>
            ))
          )}
        </div>
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

function AboutView() {
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
          <h2>Human judgment</h2>
          <p>
            You see the person and reasoning, then decide. Feedback can suggest
            preference edits but never changes them silently.
          </p>
        </div>
      </section>
      <div className="version">
        Algorithm {ALGORITHM_VERSION} · Deterministic · No hidden factors
      </div>
    </div>
  );
}
