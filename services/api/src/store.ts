import { DatabaseSync } from "node:sqlite";
import {
  defaultPreferences,
  demoUser,
  suggestPreferenceWeights,
  validatePreferences,
  validateProfile,
  type PreferenceObservation,
  type Preferences,
  type Profile,
} from "@openmatch/matching";

export type Connection = {
  id: string;
  profileId: string;
  createdAt: string;
  closedAt: string | null;
  muted: boolean;
  meetingPreference: MeetingPreference;
};
export type MeetingPreference = "not_asked" | "not_yet" | "open_to_plan";
export type Message = {
  id: number;
  connectionId: string;
  senderId: string;
  text: string;
  createdAt: string;
};
export type AccountStatus = "active" | "paused" | "hidden";
export type DeliverySettings = { batchSize: 1 | 2 | 3 | 4 | 5 };
export type IntroductionBatch = {
  weeklySeed: string;
  batchSize: number;
  entries: Array<{
    profileId: string;
    selectionMode: "score" | "exploration";
    selectionProbability: number;
  }>;
};
export type ConsentReceipt = {
  adultConfirmed: true;
  prototypeDataUseAccepted: true;
  noticeVersion: "prototype-0.1";
  acceptedAt: string;
};
export type ResearchConsentReceipt = {
  participating: boolean;
  noticeVersion: "research-prototype-0.1";
  updatedAt: string;
};

export class Store {
  readonly db: DatabaseSync;

  constructor(path = process.env.OPENMATCH_DB ?? "./openmatch.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (profile_id TEXT PRIMARY KEY, decision TEXT NOT NULL CHECK(decision IN ('interested','passed')), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, profile_id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, closed_at TEXT);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id TEXT NOT NULL REFERENCES connections(id), sender_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (profile_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS saved_introductions (profile_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preference_observations (profile_id TEXT PRIMARY KEY, interested INTEGER NOT NULL CHECK(interested IN (0,1)), factors_json TEXT NOT NULL, selection_probability REAL NOT NULL, created_at TEXT NOT NULL);
    `);
    const connectionColumns = this.db
      .prepare("PRAGMA table_info(connections)")
      .all() as Array<{ name: string }>;
    if (!connectionColumns.some(({ name }) => name === "muted"))
      this.db.exec(
        "ALTER TABLE connections ADD COLUMN muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1))",
      );
    if (!connectionColumns.some(({ name }) => name === "meeting_preference"))
      this.db.exec(
        "ALTER TABLE connections ADD COLUMN meeting_preference TEXT NOT NULL DEFAULT 'not_asked' CHECK(meeting_preference IN ('not_asked','not_yet','open_to_plan'))",
      );
    this.seed();
  }

  private seed() {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO state(key,value) VALUES (?,?)",
    );
    insert.run("profile", JSON.stringify(demoUser));
    insert.run("preferences", JSON.stringify(defaultPreferences));
    insert.run("onboarding_complete", JSON.stringify(false));
    insert.run("account_status", JSON.stringify("active"));
    insert.run("delivery_settings", JSON.stringify({ batchSize: 5 }));
    insert.run("introduction_batch", JSON.stringify(null));
    insert.run("consent_receipt", JSON.stringify(null));
    insert.run("research_consent_receipt", JSON.stringify(null));
    const profile = this.getState<Record<string, unknown>>("profile");
    if (!("readiness" in profile))
      this.setState("profile", {
        ...profile,
        readiness: "Prefer to chat first",
      });
  }

  private getState<T>(key: string): T {
    const row = this.db
      .prepare("SELECT value FROM state WHERE key=?")
      .get(key) as { value: string };
    return JSON.parse(row.value) as T;
  }

  private setState(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }

  profile() {
    return this.getState<Profile>("profile");
  }
  updateProfile(patch: Partial<Profile>) {
    const next = validateProfile({ ...this.profile(), ...patch, id: "me" });
    this.setState("profile", next);
    this.clearIntroductionBatch();
    return next;
  }
  preferences() {
    return this.getState<Preferences>("preferences");
  }
  updatePreferences(patch: Partial<Preferences>) {
    const current = this.preferences();
    const next = validatePreferences({
      ...current,
      ...patch,
      weights: { ...current.weights, ...patch.weights },
    });
    this.setState("preferences", next);
    this.clearIntroductionBatch();
    return next;
  }
  onboardingComplete() {
    return this.getState<boolean>("onboarding_complete");
  }
  completeOnboarding() {
    this.setState("onboarding_complete", true);
    return { complete: true as const };
  }
  consentReceipt() {
    return this.getState<ConsentReceipt | null>("consent_receipt");
  }
  acceptPrototypeConsent() {
    const receipt: ConsentReceipt = {
      adultConfirmed: true,
      prototypeDataUseAccepted: true,
      noticeVersion: "prototype-0.1",
      acceptedAt: new Date().toISOString(),
    };
    this.setState("consent_receipt", receipt);
    return receipt;
  }
  researchConsentReceipt() {
    return this.getState<ResearchConsentReceipt | null>(
      "research_consent_receipt",
    );
  }
  updateResearchConsent(participating: boolean) {
    const receipt: ResearchConsentReceipt = {
      participating,
      noticeVersion: "research-prototype-0.1",
      updatedAt: new Date().toISOString(),
    };
    this.setState("research_consent_receipt", receipt);
    return receipt;
  }
  accountStatus() {
    return this.getState<AccountStatus>("account_status");
  }
  updateAccountStatus(status: AccountStatus) {
    this.setState("account_status", status);
    return { status };
  }
  deliverySettings() {
    return this.getState<DeliverySettings>("delivery_settings");
  }
  updateDeliverySettings(settings: DeliverySettings) {
    this.setState("delivery_settings", settings);
    this.clearIntroductionBatch();
    return settings;
  }
  introductionBatch() {
    return this.getState<IntroductionBatch | null>("introduction_batch");
  }
  saveIntroductionBatch(batch: IntroductionBatch) {
    this.setState("introduction_batch", batch);
  }
  clearIntroductionBatch() {
    this.setState("introduction_batch", null);
  }
  decidedIds() {
    return new Set(
      (
        this.db.prepare("SELECT profile_id FROM decisions").all() as Array<{
          profile_id: string;
        }>
      ).map((row) => row.profile_id),
    );
  }
  hiddenIds() {
    return new Set(
      (
        this.db.prepare("SELECT profile_id FROM blocks").all() as Array<{
          profile_id: string;
        }>
      ).map((row) => row.profile_id),
    );
  }
  savedIds() {
    return new Set(
      (
        this.db
          .prepare("SELECT profile_id FROM saved_introductions")
          .all() as Array<{ profile_id: string }>
      ).map((row) => row.profile_id),
    );
  }
  saveIntroduction(profileId: string) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO saved_introductions(profile_id,created_at) VALUES (?,?) ON CONFLICT(profile_id) DO UPDATE SET created_at=excluded.created_at",
      )
      .run(profileId, now);
    return { profileId, saved: true as const, createdAt: now };
  }
  unsaveIntroduction(profileId: string) {
    return (
      this.db
        .prepare("DELETE FROM saved_introductions WHERE profile_id=?")
        .run(profileId).changes > 0
    );
  }

  decide(
    profileId: string,
    decision: "interested" | "passed",
    observation: Omit<PreferenceObservation, "interested">,
  ) {
    const now = new Date().toISOString();
    this.db
      .prepare("DELETE FROM saved_introductions WHERE profile_id=?")
      .run(profileId);
    this.db
      .prepare(
        "INSERT INTO decisions(profile_id,decision,created_at) VALUES (?,?,?) ON CONFLICT(profile_id) DO UPDATE SET decision=excluded.decision,created_at=excluded.created_at",
      )
      .run(profileId, decision, now);
    this.db
      .prepare(
        "INSERT INTO preference_observations(profile_id,interested,factors_json,selection_probability,created_at) VALUES (?,?,?,?,?) ON CONFLICT(profile_id) DO UPDATE SET interested=excluded.interested,factors_json=excluded.factors_json,selection_probability=excluded.selection_probability,created_at=excluded.created_at",
      )
      .run(
        profileId,
        decision === "interested" ? 1 : 0,
        JSON.stringify(observation.factors),
        observation.selectionProbability,
        now,
      );
    const mutual =
      decision === "interested" && ["mara", "noah"].includes(profileId);
    if (mutual)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO connections(id,profile_id,created_at) VALUES (?,?,?)",
        )
        .run(`connection-${profileId}`, profileId, now);
    return {
      profileId,
      decision,
      mutual,
    };
  }

  preferenceSuggestions() {
    const observations = (
      this.db
        .prepare(
          "SELECT interested,factors_json AS factorsJson,selection_probability AS selectionProbability FROM preference_observations ORDER BY created_at",
        )
        .all() as Array<{
        interested: number;
        factorsJson: string;
        selectionProbability: number;
      }>
    ).map((row) => ({
      interested: row.interested === 1,
      factors: JSON.parse(row.factorsJson) as Record<string, number>,
      selectionProbability: row.selectionProbability,
    }));
    return suggestPreferenceWeights({
      observations,
      currentWeights: this.preferences().weights,
    });
  }

  connections() {
    return (
      this.db
        .prepare(
          "SELECT id,profile_id AS profileId,created_at AS createdAt,closed_at AS closedAt,muted,meeting_preference AS meetingPreference FROM connections WHERE closed_at IS NULL ORDER BY created_at DESC",
        )
        .all() as unknown as Array<
        Omit<Connection, "muted"> & { muted: number }
      >
    ).map((connection) => ({ ...connection, muted: connection.muted === 1 }));
  }
  connection(id: string) {
    const connection = this.db
      .prepare(
        "SELECT id,profile_id AS profileId,created_at AS createdAt,closed_at AS closedAt,muted,meeting_preference AS meetingPreference FROM connections WHERE id=? AND closed_at IS NULL",
      )
      .get(id) as unknown as
      (Omit<Connection, "muted"> & { muted: number }) | undefined;
    return connection
      ? { ...connection, muted: connection.muted === 1 }
      : undefined;
  }
  messages(connectionId: string) {
    return this.db
      .prepare(
        "SELECT id,connection_id AS connectionId,sender_id AS senderId,text,created_at AS createdAt FROM messages WHERE connection_id=? ORDER BY id",
      )
      .all(connectionId) as unknown as Message[];
  }
  sendMessage(connectionId: string, text: string) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO messages(connection_id,sender_id,text,created_at) VALUES (?,?,?,?)",
      )
      .run(connectionId, "me", text, now);
    return {
      id: Number(result.lastInsertRowid),
      connectionId,
      senderId: "me",
      text,
      createdAt: now,
    };
  }
  closeConnection(id: string) {
    return (
      this.db
        .prepare(
          "UPDATE connections SET closed_at=? WHERE id=? AND closed_at IS NULL",
        )
        .run(new Date().toISOString(), id).changes > 0
    );
  }
  closePolitely(id: string, text: string) {
    if (!this.connection(id)) return undefined;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const message = this.sendMessage(id, text);
      if (!this.closeConnection(id)) throw new Error("connection_close_failed");
      this.db.exec("COMMIT");
      return { message, closed: true as const };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  updateConnectionMute(id: string, muted: boolean) {
    const result = this.db
      .prepare(
        "UPDATE connections SET muted=? WHERE id=? AND closed_at IS NULL",
      )
      .run(muted ? 1 : 0, id);
    return result.changes ? { muted } : undefined;
  }
  updateMeetingPreference(id: string, preference: MeetingPreference) {
    const result = this.db
      .prepare(
        "UPDATE connections SET meeting_preference=? WHERE id=? AND closed_at IS NULL",
      )
      .run(preference, id);
    return result.changes ? { meetingPreference: preference } : undefined;
  }
  block(profileId: string) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO blocks(profile_id,created_at) VALUES (?,?)",
      )
      .run(profileId, now);
    this.db
      .prepare(
        "UPDATE connections SET closed_at=? WHERE profile_id=? AND closed_at IS NULL",
      )
      .run(now, profileId);
    return { profileId, blocked: true };
  }
  report(profileId: string, reason: string, details: string) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO reports(profile_id,reason,details,status,created_at) VALUES (?,?,?,?,?)",
      )
      .run(profileId, reason, details, "received", now);
    return {
      id: Number(result.lastInsertRowid),
      profileId,
      reason,
      status: "received",
      createdAt: now,
    };
  }
  reports() {
    return this.db
      .prepare(
        "SELECT id,profile_id AS profileId,reason,details,status,created_at AS createdAt FROM reports ORDER BY id DESC",
      )
      .all();
  }

  exportData() {
    return {
      exportedAt: new Date().toISOString(),
      profile: this.profile(),
      preferences: this.preferences(),
      onboardingComplete: this.onboardingComplete(),
      consentReceipt: this.consentReceipt(),
      researchConsentReceipt: this.researchConsentReceipt(),
      accountStatus: this.accountStatus(),
      deliverySettings: this.deliverySettings(),
      introductionBatch: this.introductionBatch(),
      decisions: this.db
        .prepare(
          "SELECT profile_id AS profileId,decision,created_at AS createdAt FROM decisions ORDER BY created_at",
        )
        .all(),
      preferenceObservations: this.db
        .prepare(
          "SELECT profile_id AS profileId,interested,factors_json AS factors,selection_probability AS selectionProbability,created_at AS createdAt FROM preference_observations ORDER BY created_at",
        )
        .all(),
      connections: (
        this.db
          .prepare(
            "SELECT id,profile_id AS profileId,created_at AS createdAt,closed_at AS closedAt,muted,meeting_preference AS meetingPreference FROM connections ORDER BY created_at",
          )
          .all() as Array<Record<string, unknown> & { muted: number }>
      ).map((connection) => ({
        ...connection,
        muted: connection.muted === 1,
      })),
      messages: this.db
        .prepare(
          "SELECT id,connection_id AS connectionId,sender_id AS senderId,text,created_at AS createdAt FROM messages ORDER BY id",
        )
        .all(),
      blocks: this.db
        .prepare(
          "SELECT profile_id AS profileId,created_at AS createdAt FROM blocks ORDER BY created_at",
        )
        .all(),
      reports: this.db
        .prepare(
          "SELECT id,profile_id AS profileId,reason,details,status,created_at AS createdAt FROM reports ORDER BY id",
        )
        .all(),
      savedIntroductions: this.db
        .prepare(
          "SELECT profile_id AS profileId,created_at AS createdAt FROM saved_introductions ORDER BY created_at",
        )
        .all(),
    };
  }

  reset() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(
        "DELETE FROM messages; DELETE FROM connections; DELETE FROM decisions; DELETE FROM preference_observations; DELETE FROM blocks; DELETE FROM reports; DELETE FROM saved_introductions; DELETE FROM state;",
      );
      this.seed();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
