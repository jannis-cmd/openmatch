import { DatabaseSync } from "node:sqlite";
import {
  ALGORITHM_VERSION,
  DATA_FIELD_POLICIES,
  DATING_DATA_MODEL_VERSION,
  PROPOSED_RANKING_POLICY,
  defaultPreferences,
  defaultDatingDataSettings,
  demoUser,
  suggestPreferenceWeights,
  validateBehaviorEvent,
  validateDatingDataSettings,
  validateInteractionFeedback,
  validatePairPrediction,
  validatePreferences,
  validateProfile,
  type BehaviorEvent,
  type DatingDataSettings,
  type InteractionFeedback,
  type PairPrediction,
  type PreferenceObservation,
  type Preferences,
  type Profile,
} from "@openmatch/matching";
import { migrateSqlite } from "./migrations.js";
import {
  PostgresDatabaseSync,
  type ApplicationDatabase,
} from "./postgres-sync.js";

export const APPLICATION_SCHEMA_VERSION = 3;

const legacyGenderFields = (genderValue: unknown) => {
  const gender = typeof genderValue === "string" ? genderValue.trim() : "";
  const normalized = gender.toLocaleLowerCase();
  if (!gender) return { genderIdentities: [], genderSelfDescription: "" };
  if (normalized === "woman")
    return { genderIdentities: ["woman" as const], genderSelfDescription: "" };
  if (normalized === "man")
    return { genderIdentities: ["man" as const], genderSelfDescription: "" };
  if (normalized === "nonbinary" || normalized === "non-binary")
    return {
      genderIdentities: ["nonbinary" as const],
      genderSelfDescription: "",
    };
  if (normalized === "agender" || normalized === "genderfluid")
    return {
      genderIdentities: [normalized as "agender" | "genderfluid"],
      genderSelfDescription: "",
    };
  return {
    genderIdentities: ["self_described" as const],
    genderSelfDescription: gender.slice(0, 50),
  };
};

export const CONNECTION_OUTCOME_KINDS = [
  "met_in_person",
  "wanted_second_date",
  "relationship_started",
  "relationship_ended",
] as const;
export type ConnectionOutcomeKind = (typeof CONNECTION_OUTCOME_KINDS)[number];

export type Connection = {
  id: string;
  profileId: string;
  createdAt: string;
  closedAt: string | null;
  muted: boolean;
  meetingPreference: MeetingPreference;
  outcomes: Array<{ kind: ConnectionOutcomeKind; recordedAt: string }>;
};
export type MeetingPreference = "not_asked" | "not_yet" | "open_to_plan";
export type Message = {
  id: number;
  connectionId: string;
  senderId: string;
  text: string;
  createdAt: string;
};
export type AccountDeliveryAction =
  | {
      kind: "decision";
      profileId: string;
      decision: "interested" | "passed";
      observation: {
        factors: Record<string, number>;
        selectionProbability: number;
      };
      mutual: boolean;
      connectionId: string;
    }
  | {
      kind: "ensure_connection";
      connectionId: string;
      profileId: string;
      createdAt: string;
    }
  | {
      kind: "message";
      connectionId: string;
      text: string;
      senderId: string;
      createdAt: string;
    }
  | {
      kind: "close_connection";
      connectionId: string;
      closedAt: string;
    }
  | {
      kind: "polite_close";
      connectionId: string;
      text: string;
      senderId: string;
      createdAt: string;
    }
  | { kind: "block"; profileId: string };
export type AccountStatus = "active" | "paused" | "hidden";
export type DeliverySettings = { batchSize: 1 | 2 | 3 | 4 | 5 };
export type IntroductionBatch = {
  algorithmVersion: string;
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
export type DirectoryConsentReceipt = {
  participating: boolean;
  noticeVersion:
    | "account-directory-prototype-0.1"
    | "account-directory-prototype-0.2"
    | "account-directory-prototype-0.3";
  updatedAt: string;
  availableUntil?: string | null;
};
export type SetupCommand = {
  version: "setup-0.1";
  profile: Partial<Profile>;
  preferences: Partial<Preferences>;
  adultConfirmed: true;
  prototypeDataUseAccepted: true;
  joinDirectory: boolean;
};
export const directoryParticipationIsActive = (
  receipt: DirectoryConsentReceipt | null,
  _now = Date.now(),
) => receipt?.participating === true;
export type ReportUpdateKind =
  "additional_context" | "correction" | "withdrawal_request";

export class Store {
  readonly db: ApplicationDatabase;
  private readonly accountProfile: boolean;

  constructor(
    path = process.env.OPENMATCH_DB ?? "./openmatch.sqlite",
    options: {
      accountProfile?: boolean;
      accountId?: string;
      postgresUrl?: string | null;
    } = {},
  ) {
    this.accountProfile = options.accountProfile === true;
    const postgresUrl =
      options.postgresUrl === undefined
        ? this.accountProfile
          ? (process.env.OPENMATCH_POSTGRES_URL ?? null)
          : null
        : options.postgresUrl;
    if (postgresUrl) {
      if (!options.accountId)
        throw new Error("PostgreSQL application stores require an account ID");
      this.db = new PostgresDatabaseSync(postgresUrl, options.accountId);
      this.seed();
      return;
    }
    const sqlite = new DatabaseSync(path);
    this.db = sqlite as unknown as ApplicationDatabase;
    sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    const schemaVersion = migrateSqlite(sqlite, "application data", [
      (database) => {
        database.exec(`
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (profile_id TEXT PRIMARY KEY, decision TEXT NOT NULL CHECK(decision IN ('interested','passed')), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, profile_id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, closed_at TEXT);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id TEXT NOT NULL REFERENCES connections(id), sender_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (profile_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS report_updates (id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('additional_context','correction','withdrawal_request')), details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS saved_introductions (profile_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preference_observations (profile_id TEXT PRIMARY KEY, interested INTEGER NOT NULL CHECK(interested IN (0,1)), factors_json TEXT NOT NULL, selection_probability REAL NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS processed_account_events (event_id TEXT PRIMARY KEY, processed_at TEXT NOT NULL);
    `);
        const connectionColumns = database
          .prepare("PRAGMA table_info(connections)")
          .all() as Array<{ name: string }>;
        if (!connectionColumns.some(({ name }) => name === "muted"))
          database.exec(
            "ALTER TABLE connections ADD COLUMN muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1))",
          );
        if (
          !connectionColumns.some(({ name }) => name === "meeting_preference")
        )
          database.exec(
            "ALTER TABLE connections ADD COLUMN meeting_preference TEXT NOT NULL DEFAULT 'not_asked' CHECK(meeting_preference IN ('not_asked','not_yet','open_to_plan'))",
          );
        const messageColumns = database
          .prepare("PRAGMA table_info(messages)")
          .all() as Array<{ name: string }>;
        if (!messageColumns.some(({ name }) => name === "delivery_event_id"))
          database.exec(
            "ALTER TABLE messages ADD COLUMN delivery_event_id TEXT",
          );
        database.exec(
          "CREATE UNIQUE INDEX IF NOT EXISTS messages_delivery_event_id ON messages(delivery_event_id) WHERE delivery_event_id IS NOT NULL",
        );
      },
      (database) => {
        database.exec(`
          CREATE TABLE connection_outcomes (
            connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK(kind IN ('met_in_person','wanted_second_date','relationship_started','relationship_ended')),
            recorded_at TEXT NOT NULL,
            PRIMARY KEY(connection_id,kind)
          );
        `);
      },
      (database) => {
        database.exec(`
          CREATE TABLE data_model_records (
            id TEXT PRIMARY KEY,
            family TEXT NOT NULL CHECK(family IN ('behavior','match_funnel','communication_metadata','activity','profile_media','profile_quality','pair_feature','context','exposure_audit','prediction','recommendation','feedback','safety')),
            subject_id TEXT,
            occurred_at TEXT NOT NULL,
            consent_notice_version TEXT,
            payload_json TEXT NOT NULL
          );
          CREATE INDEX data_model_records_family_time ON data_model_records(family,occurred_at);
          CREATE INDEX data_model_records_subject ON data_model_records(subject_id) WHERE subject_id IS NOT NULL;
        `);
      },
    ]);
    if (schemaVersion !== APPLICATION_SCHEMA_VERSION)
      throw new Error("application schema version declaration is stale");
    this.seed();
  }

  private seed() {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO state(key,value) VALUES (?,?)",
    );
    insert.run(
      "profile",
      JSON.stringify(
        this.accountProfile
          ? {
              ...demoUser,
              gender: "",
              genderIdentities: [],
              genderGroups: [],
            }
          : demoUser,
      ),
    );
    insert.run(
      "preferences",
      JSON.stringify(
        this.accountProfile
          ? { ...defaultPreferences, genderGroups: [] }
          : defaultPreferences,
      ),
    );
    insert.run("onboarding_complete", JSON.stringify(false));
    insert.run("account_status", JSON.stringify("active"));
    insert.run("delivery_settings", JSON.stringify({ batchSize: 5 }));
    insert.run("introduction_batch", JSON.stringify(null));
    insert.run("consent_receipt", JSON.stringify(null));
    insert.run("research_consent_receipt", JSON.stringify(null));
    insert.run("directory_consent_receipt", JSON.stringify(null));
    insert.run(
      "dating_data_settings",
      JSON.stringify(defaultDatingDataSettings()),
    );
    const profile = this.getState<Record<string, unknown>>("profile");
    if (
      !("readiness" in profile) ||
      !("gender" in profile) ||
      !("genderIdentities" in profile) ||
      !("genderSelfDescription" in profile) ||
      !("photo" in profile)
    )
      this.setState("profile", {
        ...profile,
        ...(!("readiness" in profile)
          ? { readiness: "Prefer to chat first" }
          : {}),
        ...(!("gender" in profile)
          ? this.accountProfile
            ? { gender: "", genderGroups: [] }
            : {
                gender: demoUser.gender,
                genderGroups: demoUser.genderGroups,
              }
          : {}),
        ...(!("genderIdentities" in profile)
          ? legacyGenderFields(profile.gender)
          : {}),
        ...(!("genderSelfDescription" in profile)
          ? { genderSelfDescription: "" }
          : {}),
        ...(!("photo" in profile) ? { photo: null } : {}),
      });
    const preferences = this.getState<Record<string, unknown>>("preferences");
    if (!("genderGroups" in preferences))
      this.setState("preferences", {
        ...preferences,
        genderGroups: this.accountProfile
          ? []
          : defaultPreferences.genderGroups,
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
    const current = this.profile();
    const legacyFields =
      patch.genderIdentities === undefined &&
      current.genderIdentities.length === 0 &&
      patch.gender !== undefined
        ? legacyGenderFields(patch.gender)
        : {};
    const next = validateProfile({
      ...current,
      ...patch,
      ...legacyFields,
      id: "me",
    });
    this.setState("profile", next);
    this.clearIntroductionBatch();
    return next;
  }
  preferences() {
    return this.getState<Preferences>("preferences");
  }
  datingDataSettings() {
    return validateDatingDataSettings(
      this.getState<DatingDataSettings>("dating_data_settings"),
    );
  }
  replaceDatingDataSettings(value: DatingDataSettings) {
    const next = validateDatingDataSettings({
      ...value,
      version: DATING_DATA_MODEL_VERSION,
      updatedAt: new Date().toISOString(),
      collection: {
        ...value.collection,
        noticeVersion: "matching-data-controls-1.0",
        updatedAt: new Date().toISOString(),
      },
    });
    this.setState("dating_data_settings", next);
    this.clearIntroductionBatch();
    return next;
  }
  dataModelDescription() {
    return {
      version: DATING_DATA_MODEL_VERSION,
      settings: this.datingDataSettings(),
      fieldPolicies: DATA_FIELD_POLICIES,
      proposedRankingPolicy: PROPOSED_RANKING_POLICY,
      prohibitedDerivedScores: [
        "global_attractiveness",
        "universal_desirability_elo",
        "message_content_engagement",
        "unreviewed_report_penalty",
        "precise_location_or_movement_profile",
      ],
    };
  }
  private appendDataModelRecord(
    family:
      | "behavior"
      | "match_funnel"
      | "communication_metadata"
      | "activity"
      | "profile_media"
      | "profile_quality"
      | "pair_feature"
      | "context"
      | "exposure_audit"
      | "prediction"
      | "recommendation"
      | "feedback"
      | "safety",
    id: string,
    subjectId: string | null,
    occurredAt: string,
    payload: unknown,
    consentNoticeVersion: string | null,
  ) {
    this.db
      .prepare(
        "INSERT INTO data_model_records(id,family,subject_id,occurred_at,consent_notice_version,payload_json) VALUES (?,?,?,?,?,?)",
      )
      .run(
        id,
        family,
        subjectId,
        occurredAt,
        consentNoticeVersion,
        JSON.stringify(payload),
      );
  }
  recordBehaviorEvent(value: BehaviorEvent) {
    const settings = this.datingDataSettings();
    if (!settings.collection.behavioralLearning)
      throw new RangeError("behavioral learning consent is required");
    const event = validateBehaviorEvent(value);
    this.appendDataModelRecord(
      "behavior",
      event.id,
      event.candidateId,
      event.occurredAt,
      event,
      settings.collection.noticeVersion,
    );
    return event;
  }
  recordInteractionFeedback(value: InteractionFeedback) {
    const settings = this.datingDataSettings();
    if (!settings.collection.interactionOutcomeLearning)
      throw new RangeError("interaction outcome consent is required");
    const feedback = validateInteractionFeedback(value);
    const connectionExists = this.db
      .prepare("SELECT 1 AS found FROM connections WHERE id = ?")
      .get(feedback.connectionId) as { found: 1 } | undefined;
    if (!connectionExists) throw new RangeError("connection does not exist");
    this.appendDataModelRecord(
      "feedback",
      feedback.id,
      feedback.connectionId,
      feedback.recordedAt,
      feedback,
      settings.collection.noticeVersion,
    );
    return feedback;
  }
  recordPairPrediction(value: PairPrediction) {
    const prediction = validatePairPrediction(value);
    const collection = this.datingDataSettings().collection;
    if (
      prediction.featureFamiliesUsed.includes("behavior") &&
      !collection.behavioralLearning
    )
      throw new RangeError("behavioral learning consent is required");
    if (
      prediction.featureFamiliesUsed.includes("activity") &&
      !collection.activityTiming
    )
      throw new RangeError("activity timing consent is required");
    this.appendDataModelRecord(
      "prediction",
      prediction.id,
      prediction.personBId,
      prediction.computedAt,
      prediction,
      collection.noticeVersion,
    );
    return prediction;
  }
  dataModelRecords() {
    return (
      this.db
        .prepare(
          "SELECT id,family,subject_id AS subjectId,occurred_at AS occurredAt,consent_notice_version AS consentNoticeVersion,payload_json AS payload FROM data_model_records ORDER BY occurred_at,id",
        )
        .all() as Array<Record<string, unknown> & { payload: string }>
    ).map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
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
  discoveryConfigured() {
    const profile = this.profile();
    const preferences = this.preferences();
    return (
      profile.genderIdentities.length > 0 &&
      profile.genderGroups.length > 0 &&
      preferences.genderGroups.length > 0
    );
  }
  completeOnboarding() {
    if (!this.discoveryConfigured())
      throw new RangeError("gender discovery choices are required");
    this.setState("onboarding_complete", true);
    return { complete: true as const };
  }
  completeSetup(command: SetupCommand) {
    if (
      command.version !== "setup-0.1" ||
      command.adultConfirmed !== true ||
      command.prototypeDataUseAccepted !== true ||
      typeof command.joinDirectory !== "boolean"
    )
      throw new RangeError("invalid setup command");
    const profile = validateProfile({
      ...this.profile(),
      ...command.profile,
      ...(command.profile.genderIdentities === undefined
        ? legacyGenderFields(command.profile.gender)
        : {}),
      id: "me",
    });
    const currentPreferences = this.preferences();
    const preferences = validatePreferences({
      ...currentPreferences,
      ...command.preferences,
      weights: {
        ...currentPreferences.weights,
        ...command.preferences.weights,
      },
    });
    if (
      !profile.genderIdentities.length ||
      !profile.genderGroups.length ||
      !preferences.genderGroups.length
    )
      throw new RangeError("gender discovery choices are required");
    const acceptedAt = new Date();
    const consent: ConsentReceipt = {
      adultConfirmed: true,
      prototypeDataUseAccepted: true,
      noticeVersion: "prototype-0.1",
      acceptedAt: acceptedAt.toISOString(),
    };
    const directoryConsent = command.joinDirectory
      ? {
          participating: true as const,
          noticeVersion: "account-directory-prototype-0.3" as const,
          updatedAt: acceptedAt.toISOString(),
          availableUntil: null,
        }
      : null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.setState("profile", profile);
      this.setState("preferences", preferences);
      this.setState("consent_receipt", consent);
      this.setState("directory_consent_receipt", directoryConsent);
      this.setState("onboarding_complete", true);
      this.clearIntroductionBatch();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      version: command.version,
      complete: true as const,
      profile,
      preferences,
      consent,
      directoryConsent,
    };
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
  directoryConsentReceipt() {
    return this.getState<DirectoryConsentReceipt | null>(
      "directory_consent_receipt",
    );
  }
  updateDirectoryConsent(participating: boolean) {
    const updatedAt = new Date();
    const receipt: DirectoryConsentReceipt = {
      participating,
      noticeVersion: "account-directory-prototype-0.3",
      updatedAt: updatedAt.toISOString(),
      availableUntil: null,
    };
    this.setState("directory_consent_receipt", receipt);
    this.clearIntroductionBatch();
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
        this.db
          .prepare(
            `SELECT profile_id FROM blocks
             UNION SELECT profile_id FROM reports`,
          )
          .all() as Array<{ profile_id: string }>
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
    mutual = decision === "interested" && ["mara", "noah"].includes(profileId),
    connectionId = `connection-${profileId}`,
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
    if (mutual) this.ensureConnection(connectionId, profileId, now);
    return {
      profileId,
      decision,
      mutual,
    };
  }

  decisionFor(profileId: string) {
    return (
      this.db
        .prepare("SELECT decision FROM decisions WHERE profile_id=?")
        .get(profileId) as { decision: "interested" | "passed" } | undefined
    )?.decision;
  }

  ensureConnection(
    id: string,
    profileId: string,
    createdAt = new Date().toISOString(),
  ) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO connections(id,profile_id,created_at) VALUES (?,?,?)",
      )
      .run(id, profileId, createdAt);
    return this.connection(id);
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

  preferenceObservationCount() {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM preference_observations")
        .get() as {
        count: number;
      }
    ).count;
  }

  clearPreferenceObservations() {
    const cleared = this.preferenceObservationCount();
    this.db.prepare("DELETE FROM preference_observations").run();
    return { cleared, observationCount: 0 };
  }

  connections() {
    return (
      this.db
        .prepare(
          "SELECT id,profile_id AS profileId,created_at AS createdAt,closed_at AS closedAt,muted,meeting_preference AS meetingPreference FROM connections WHERE closed_at IS NULL ORDER BY created_at DESC",
        )
        .all() as unknown as Array<
        Omit<Connection, "muted" | "outcomes"> & { muted: number }
      >
    ).map((connection) => ({
      ...connection,
      muted: connection.muted === 1,
      outcomes: this.connectionOutcomes(connection.id),
    }));
  }
  pastConnections() {
    return (
      this.db
        .prepare(
          "SELECT id,profile_id AS profileId,created_at AS createdAt,closed_at AS closedAt,muted,meeting_preference AS meetingPreference FROM connections WHERE closed_at IS NOT NULL ORDER BY closed_at DESC",
        )
        .all() as unknown as Array<
        Omit<Connection, "muted" | "outcomes"> & { muted: number }
      >
    ).map((connection) => ({
      ...connection,
      muted: connection.muted === 1,
      outcomes: this.connectionOutcomes(connection.id),
    }));
  }
  private connectionRecord(id: string) {
    return this.db.prepare("SELECT id FROM connections WHERE id=?").get(id) as
      { id: string } | undefined;
  }
  connection(id: string) {
    const connection = this.db
      .prepare(
        "SELECT id,profile_id AS profileId,created_at AS createdAt,closed_at AS closedAt,muted,meeting_preference AS meetingPreference FROM connections WHERE id=? AND closed_at IS NULL",
      )
      .get(id) as unknown as
      (Omit<Connection, "muted" | "outcomes"> & { muted: number }) | undefined;
    return connection
      ? {
          ...connection,
          muted: connection.muted === 1,
          outcomes: this.connectionOutcomes(connection.id),
        }
      : undefined;
  }
  connectionOutcomes(connectionId: string) {
    return this.db
      .prepare(
        "SELECT kind,recorded_at AS recordedAt FROM connection_outcomes WHERE connection_id=? ORDER BY recorded_at,kind",
      )
      .all(connectionId) as Array<{
      kind: ConnectionOutcomeKind;
      recordedAt: string;
    }>;
  }
  updateConnectionOutcome(
    connectionId: string,
    kind: ConnectionOutcomeKind,
    recorded: boolean,
  ) {
    if (!this.connectionRecord(connectionId)) return undefined;
    if (recorded)
      this.db
        .prepare(
          "INSERT INTO connection_outcomes(connection_id,kind,recorded_at) VALUES (?,?,?) ON CONFLICT(connection_id,kind) DO NOTHING",
        )
        .run(connectionId, kind, new Date().toISOString());
    else
      this.db
        .prepare(
          "DELETE FROM connection_outcomes WHERE connection_id=? AND kind=?",
        )
        .run(connectionId, kind);
    return { outcomes: this.connectionOutcomes(connectionId) };
  }
  messages(connectionId: string) {
    return this.db
      .prepare(
        "SELECT id,connection_id AS connectionId,sender_id AS senderId,text,created_at AS createdAt FROM messages WHERE connection_id=? ORDER BY id",
      )
      .all(connectionId) as unknown as Message[];
  }
  sendMessage(
    connectionId: string,
    text: string,
    senderId = "me",
    createdAt = new Date().toISOString(),
    deliveryEventId: string | null = null,
  ) {
    const result = this.db
      .prepare(
        "INSERT INTO messages(connection_id,sender_id,text,created_at,delivery_event_id) VALUES (?,?,?,?,?)",
      )
      .run(connectionId, senderId, text, createdAt, deliveryEventId);
    return {
      id: Number(result.lastInsertRowid),
      connectionId,
      senderId,
      text,
      createdAt,
    };
  }
  messageForDeliveryEvent(eventId: string) {
    return this.db
      .prepare(
        "SELECT id,connection_id AS connectionId,sender_id AS senderId,text,created_at AS createdAt FROM messages WHERE delivery_event_id=?",
      )
      .get(eventId) as Message | undefined;
  }
  applyAccountEvent(eventId: string, action: AccountDeliveryAction) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const inserted = this.db
        .prepare(
          "INSERT OR IGNORE INTO processed_account_events(event_id,processed_at) VALUES (?,?)",
        )
        .run(eventId, new Date().toISOString()).changes;
      if (!inserted) {
        this.db.exec("COMMIT");
        return false;
      }
      if (action.kind === "decision")
        this.decide(
          action.profileId,
          action.decision,
          action.observation,
          action.mutual,
          action.connectionId,
        );
      else if (action.kind === "ensure_connection")
        this.ensureConnection(
          action.connectionId,
          action.profileId,
          action.createdAt,
        );
      else if (action.kind === "message")
        this.sendMessage(
          action.connectionId,
          action.text,
          action.senderId,
          action.createdAt,
          eventId,
        );
      else if (action.kind === "close_connection")
        this.db
          .prepare(
            "UPDATE connections SET closed_at=? WHERE id=? AND closed_at IS NULL",
          )
          .run(action.closedAt, action.connectionId);
      else if (action.kind === "polite_close") {
        this.sendMessage(
          action.connectionId,
          action.text,
          action.senderId,
          action.createdAt,
          eventId,
        );
        this.db
          .prepare(
            "UPDATE connections SET closed_at=? WHERE id=? AND closed_at IS NULL",
          )
          .run(action.createdAt, action.connectionId);
      } else this.block(action.profileId);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
    const reports = this.db
      .prepare(
        "SELECT id,profile_id AS profileId,reason,details,status,created_at AS createdAt FROM reports ORDER BY id DESC",
      )
      .all() as Array<Record<string, unknown> & { id: number }>;
    const updates = this.db
      .prepare(
        "SELECT id,report_id AS reportId,kind,details,created_at AS createdAt FROM report_updates ORDER BY id",
      )
      .all() as Array<Record<string, unknown> & { reportId: number }>;
    return reports.map((report) => ({
      ...report,
      updates: updates.filter(({ reportId }) => reportId === report.id),
    }));
  }
  addReportUpdate(reportId: number, kind: ReportUpdateKind, details: string) {
    const report = this.db
      .prepare("SELECT id FROM reports WHERE id=?")
      .get(reportId);
    if (!report) return undefined;
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO report_updates(report_id,kind,details,created_at) VALUES (?,?,?,?)",
      )
      .run(reportId, kind, details, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      reportId,
      kind,
      details,
      createdAt,
    };
  }

  exportData() {
    return {
      schemaVersion: "1.2.0",
      algorithmVersion: ALGORITHM_VERSION,
      exportedAt: new Date().toISOString(),
      profile: this.profile(),
      preferences: this.preferences(),
      datingDataModel: this.dataModelDescription(),
      dataModelRecords: this.dataModelRecords(),
      onboardingComplete: this.onboardingComplete(),
      consentReceipt: this.consentReceipt(),
      researchConsentReceipt: this.researchConsentReceipt(),
      directoryConsentReceipt: this.directoryConsentReceipt(),
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
      connectionOutcomes: this.db
        .prepare(
          "SELECT connection_id AS connectionId,kind,recorded_at AS recordedAt FROM connection_outcomes ORDER BY recorded_at,kind",
        )
        .all(),
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
      reportUpdates: this.db
        .prepare(
          "SELECT id,report_id AS reportId,kind,details,created_at AS createdAt FROM report_updates ORDER BY id",
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
        "DELETE FROM data_model_records; DELETE FROM connection_outcomes; DELETE FROM messages; DELETE FROM connections; DELETE FROM decisions; DELETE FROM preference_observations; DELETE FROM blocks; DELETE FROM report_updates; DELETE FROM reports; DELETE FROM saved_introductions; DELETE FROM processed_account_events; DELETE FROM state;",
      );
      this.seed();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  eraseDeletedAccount(profileId: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM messages WHERE sender_id=? OR connection_id IN (SELECT id FROM connections WHERE profile_id=?)",
        )
        .run(profileId, profileId);
      this.db
        .prepare(
          "DELETE FROM connection_outcomes WHERE connection_id IN (SELECT id FROM connections WHERE profile_id=?)",
        )
        .run(profileId);
      this.db
        .prepare(
          "DELETE FROM data_model_records WHERE subject_id=? OR subject_id IN (SELECT id FROM connections WHERE profile_id=?)",
        )
        .run(profileId, profileId);
      this.db
        .prepare("DELETE FROM connections WHERE profile_id=?")
        .run(profileId);
      this.db
        .prepare("DELETE FROM decisions WHERE profile_id=?")
        .run(profileId);
      this.db
        .prepare("DELETE FROM preference_observations WHERE profile_id=?")
        .run(profileId);
      this.db.prepare("DELETE FROM blocks WHERE profile_id=?").run(profileId);
      this.db.prepare("DELETE FROM reports WHERE profile_id=?").run(profileId);
      this.db
        .prepare("DELETE FROM saved_introductions WHERE profile_id=?")
        .run(profileId);
      this.clearIntroductionBatch();
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
