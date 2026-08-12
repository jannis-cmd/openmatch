"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  type Connection,
  type Message,
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

export default function Home() {
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
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(demoUser.bio);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WeightSuggestion[]>([]);
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
      ] = await Promise.all([
        api.profile(),
        api.preferences(),
        api.introductions(),
        api.connections(),
        api.onboarding(),
        api.preferenceSuggestions(),
      ]);
      setProfile(nextProfile);
      setBio(nextProfile.bio);
      setPreferences(nextPreferences);
      setIntroductions(nextIntroductions.items);
      setConnections(nextConnections.items);
      setOnboarded(onboarding.complete);
      setSuggestions(nextSuggestions.items);
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
        <button className="brand" onClick={() => setView("today")}>
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
                  bio={bio}
                  editing={editing}
                  setEditing={async (value) => {
                    if (!value && editing) {
                      const saved = await api.updateProfile({ bio });
                      setProfile(saved);
                    }
                    setEditing(value);
                  }}
                  setBio={setBio}
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
  bio,
  editing,
  setEditing,
  setBio,
  exportData,
  deleteData,
}: {
  profile: Profile;
  bio: string;
  editing: boolean;
  setEditing: (value: boolean) => void | Promise<void>;
  setBio: (value: string) => void;
  exportData: () => Promise<void>;
  deleteData: () => Promise<void>;
}) {
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
            onClick={() => void setEditing(!editing)}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        {editing ? (
          <textarea
            aria-label="Biography"
            value={bio}
            maxLength={500}
            onChange={(event) => setBio(event.target.value)}
          />
        ) : (
          <p className="large-copy">{bio}</p>
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
          <button onClick={() => void exportData()}>Export my data</button>
          <button className="danger" onClick={() => void deleteData()}>
            Delete local data
          </button>
        </div>
      </section>
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
