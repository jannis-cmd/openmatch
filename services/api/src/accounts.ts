import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import {
  directoryParticipationIsActive,
  Store,
  type AccountDeliveryAction,
} from "./store.js";
import type { SecurityNotificationEvent } from "./email-verification.js";
import type { Candidate, PublicProfile } from "@openmatch/matching";
import { migrateSqlite } from "./migrations.js";

export const ACCOUNT_SCHEMA_VERSION = 3;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MINIMUM = 15;
const COMMON_PASSWORDS = new Set([
  "123456789012345",
  "adminadminadminadmin",
  "correcthorsebatterystaple",
  "dragonballzdragon",
  "footballfootball",
  "iloveyouiloveyou",
  "letmeinletmeinletmein",
  "monkeymonkeymonkey",
  "openmatchopenmatch",
  "passwordpassword",
  "princessprincess",
  "qwertyqwertyqwerty",
  "sunshinesunshine",
  "trustno1trustno1",
  "welcomecomewelcome",
]);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const RECOVERY_CODE_COUNT = 8;
const SECURITY_NOTICE_RETRY_BASE_MS = 60_000;
const SECURITY_NOTICE_RETRY_MAX_MS = 6 * 60 * 60_000;
const SECURITY_NOTICE_LEASE_MS = 30_000;
const ACCOUNT_DELIVERY_RETRY_BASE_MS = 5_000;
const ACCOUNT_DELIVERY_RETRY_MAX_MS = 5 * 60_000;
const ACCOUNT_DELIVERY_LEASE_MS = 30_000;
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type AccountRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
};

export type AccountSession = {
  accountId: string;
  sessionId: string;
  token: string;
  expiresAt: string;
  store: Store;
};
export type SessionClient = "web" | "ios" | "android" | "unknown";
export type PublicAccountSession = {
  id: string;
  client: SessionClient;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};
export type AdminSession = {
  adminId: string;
  email: string;
  sessionId: string;
  token: string;
  expiresAt: string;
};

export class AccountError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export class Accounts {
  readonly db: DatabaseSync;
  private readonly stores = new Map<string, Store>();
  private readonly dataDirectory: string | null;
  private readonly sessionTtlMs: number;
  private readonly beforeDelivery?: (
    eventId: string,
    accountId: string,
    position: 1 | 2,
  ) => void;

  constructor(
    path = process.env.OPENMATCH_ACCOUNTS_DB ?? "./openmatch-accounts.sqlite",
    options: {
      dataDirectory?: string | null;
      sessionTtlMs?: number;
      beforeDelivery?: (
        eventId: string,
        accountId: string,
        position: 1 | 2,
      ) => void;
    } = {},
  ) {
    this.db = new DatabaseSync(path);
    this.dataDirectory =
      options.dataDirectory === undefined
        ? path === ":memory:"
          ? null
          : join(dirname(path), "openmatch-account-data")
        : options.dataDirectory;
    this.sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    this.beforeDelivery = options.beforeDelivery;
    if (!Number.isInteger(this.sessionTtlMs) || this.sessionTtlMs < 60_000)
      throw new RangeError(
        "account session lifetime must be at least one minute",
      );
    if (this.dataDirectory) mkdirSync(this.dataDirectory, { recursive: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    const schemaVersion = migrateSqlite(this.db, "account registry", [
      (database) => {
        database.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_sessions (
        token_hash TEXT PRIMARY KEY,
        id TEXT UNIQUE NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        client TEXT NOT NULL CHECK(client IN ('web','ios','android','unknown')),
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_recovery_codes (
        code_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_email_verifications (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        code_salt TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        sent_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_notification_addresses (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        verified_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_notification_verifications (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        code_salt TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        sent_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_delivery_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        first_account_id TEXT NOT NULL,
        second_account_id TEXT,
        first_action_json TEXT NOT NULL,
        second_action_json TEXT,
        created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        last_error_code TEXT,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        lease_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS account_security_notification_outbox (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recipients_json TEXT NOT NULL,
        delivered_json TEXT NOT NULL DEFAULT '[]',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        lease_until INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
        const accountColumns = database
          .prepare("PRAGMA table_info(accounts)")
          .all() as Array<{
          name: string;
        }>;
        if (!accountColumns.some(({ name }) => name === "email_verified_at"))
          database.exec(
            "ALTER TABLE accounts ADD COLUMN email_verified_at TEXT",
          );
        const sessionColumns = database
          .prepare("PRAGMA table_info(account_sessions)")
          .all() as Array<{ name: string }>;
        if (!sessionColumns.some(({ name }) => name === "id"))
          database.exec("ALTER TABLE account_sessions ADD COLUMN id TEXT");
        if (!sessionColumns.some(({ name }) => name === "client"))
          database.exec(
            "ALTER TABLE account_sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'unknown'",
          );
        const deliveryColumns = database
          .prepare("PRAGMA table_info(account_delivery_events)")
          .all() as Array<{ name: string }>;
        if (!deliveryColumns.some(({ name }) => name === "attempt_count"))
          database.exec(
            "ALTER TABLE account_delivery_events ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0",
          );
        if (!deliveryColumns.some(({ name }) => name === "last_attempt_at"))
          database.exec(
            "ALTER TABLE account_delivery_events ADD COLUMN last_attempt_at TEXT",
          );
        if (!deliveryColumns.some(({ name }) => name === "last_error_code"))
          database.exec(
            "ALTER TABLE account_delivery_events ADD COLUMN last_error_code TEXT",
          );
        if (!deliveryColumns.some(({ name }) => name === "next_attempt_at"))
          database.exec(
            "ALTER TABLE account_delivery_events ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0",
          );
        if (!deliveryColumns.some(({ name }) => name === "lease_until"))
          database.exec(
            "ALTER TABLE account_delivery_events ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0",
          );
        const notificationOutboxColumns = database
          .prepare("PRAGMA table_info(account_security_notification_outbox)")
          .all() as Array<{ name: string }>;
        if (
          !notificationOutboxColumns.some(
            ({ name }) => name === "next_attempt_at",
          )
        )
          database.exec(
            "ALTER TABLE account_security_notification_outbox ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0",
          );
        if (
          !notificationOutboxColumns.some(({ name }) => name === "lease_until")
        )
          database.exec(
            "ALTER TABLE account_security_notification_outbox ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0",
          );
        const sessionsWithoutId = database
          .prepare(
            "SELECT token_hash AS tokenHash FROM account_sessions WHERE id IS NULL",
          )
          .all() as Array<{ tokenHash: string }>;
        const assignId = database.prepare(
          "UPDATE account_sessions SET id=? WHERE token_hash=?",
        );
        for (const session of sessionsWithoutId)
          assignId.run(randomUUID(), session.tokenHash);
        database.exec(
          "CREATE UNIQUE INDEX IF NOT EXISTS account_sessions_id ON account_sessions(id)",
        );
      },
      (database) => {
        database.exec(`
          CREATE TABLE account_email_change_requests (
            account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
            email TEXT UNIQUE NOT NULL,
            current_code_hash TEXT NOT NULL,
            current_code_salt TEXT NOT NULL,
            new_code_hash TEXT NOT NULL,
            new_code_salt TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            sent_at INTEGER NOT NULL
          );
        `);
      },
      (database) => {
        database.exec(`
          CREATE TABLE admin_accounts (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE admin_sessions (
            token_hash TEXT PRIMARY KEY,
            id TEXT UNIQUE NOT NULL,
            admin_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE admin_audit_events (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            metadata_json TEXT NOT NULL
          );
        `);
      },
    ]);
    if (schemaVersion !== ACCOUNT_SCHEMA_VERSION)
      throw new Error("account schema version declaration is stale");
    try {
      this.flushDeliveryEvents(true);
    } catch {
      // The durable row remains available for ordered retry and status. A
      // transient target-store failure must not prevent the API from starting.
    }
  }

  private enqueueDelivery(
    firstAccountId: string,
    firstAction: AccountDeliveryAction,
    secondAccountId?: string,
    secondAction?: AccountDeliveryAction,
    eventId: string = randomUUID(),
  ) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO account_delivery_events(
          id,first_account_id,second_account_id,first_action_json,second_action_json,created_at
        ) VALUES (?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        firstAccountId,
        secondAccountId ?? null,
        JSON.stringify(firstAction),
        secondAction ? JSON.stringify(secondAction) : null,
        new Date().toISOString(),
      );
    try {
      this.flushDeliveryEvents(true);
    } catch {
      throw new AccountError("account_delivery_incomplete", 503);
    }
    const pending = this.db
      .prepare("SELECT 1 FROM account_delivery_events WHERE id=?")
      .get(eventId);
    if (pending) throw new AccountError("account_delivery_incomplete", 503);
    return eventId;
  }

  flushDeliveryEvents(force = false) {
    while (true) {
      const event = this.db
        .prepare(
          `SELECT id,first_account_id AS firstAccountId,second_account_id AS secondAccountId,
                  first_action_json AS firstActionJson,second_action_json AS secondActionJson,
                  attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,
                  lease_until AS leaseUntil
           FROM account_delivery_events ORDER BY sequence LIMIT 1`,
        )
        .get() as
        | {
            id: string;
            firstAccountId: string;
            secondAccountId: string | null;
            firstActionJson: string;
            secondActionJson: string | null;
            attemptCount: number;
            nextAttemptAt: number;
            leaseUntil: number;
          }
        | undefined;
      if (!event) return;
      const now = Date.now();
      if (event.leaseUntil > now || (!force && event.nextAttemptAt > now))
        return;
      const claimed = this.db
        .prepare(
          `UPDATE account_delivery_events SET lease_until=?
           WHERE id=? AND lease_until<=? AND (?=1 OR next_attempt_at<=?)`,
        )
        .run(
          now + ACCOUNT_DELIVERY_LEASE_MS,
          event.id,
          now,
          force ? 1 : 0,
          now,
        );
      if (!claimed.changes) return;
      const attemptedAt = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE account_delivery_events SET attempt_count=attempt_count+1,last_attempt_at=?,last_error_code=NULL WHERE id=?",
        )
        .run(attemptedAt, event.id);
      try {
        const firstStore = this.accountStore(event.firstAccountId);
        if (firstStore) {
          this.beforeDelivery?.(event.id, event.firstAccountId, 1);
          firstStore.applyAccountEvent(
            event.id,
            JSON.parse(event.firstActionJson) as AccountDeliveryAction,
          );
        }
        if (event.secondAccountId && event.secondActionJson) {
          const secondStore = this.accountStore(event.secondAccountId);
          if (secondStore) {
            this.beforeDelivery?.(event.id, event.secondAccountId, 2);
            secondStore.applyAccountEvent(
              event.id,
              JSON.parse(event.secondActionJson) as AccountDeliveryAction,
            );
          }
        }
        this.db
          .prepare("DELETE FROM account_delivery_events WHERE id=?")
          .run(event.id);
      } catch (error) {
        const retryDelay = Math.min(
          ACCOUNT_DELIVERY_RETRY_BASE_MS * 2 ** event.attemptCount,
          ACCOUNT_DELIVERY_RETRY_MAX_MS,
        );
        this.db
          .prepare(
            `UPDATE account_delivery_events
             SET last_error_code='target_write_failed',next_attempt_at=?,lease_until=0
             WHERE id=?`,
          )
          .run(Date.now() + retryDelay, event.id);
        throw error;
      }
    }
  }

  pendingDeliveryCount() {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM account_delivery_events")
        .get() as { count: number }
    ).count;
  }

  pendingSecurityNotificationCount() {
    return (
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM account_security_notification_outbox",
        )
        .get() as { count: number }
    ).count;
  }

  bootstrapAdmin(emailValue: unknown, passwordValue: unknown) {
    const email = this.normalizeEmail(emailValue);
    const password = this.validatePassword(passwordValue);
    const salt = randomBytes(16);
    const adminId = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      this.db
        .prepare(
          "INSERT INTO admin_accounts(id,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)",
        )
        .run(
          adminId,
          email,
          this.passwordHash(password, salt).toString("base64url"),
          salt.toString("base64url"),
          createdAt,
        );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed"))
        throw new AccountError("admin_exists", 409);
      throw error;
    }
    this.auditAdmin(adminId, "admin_bootstrapped", { email });
    return { adminId, email, createdAt };
  }

  private auditAdmin(
    adminId: string,
    action: string,
    metadata: Record<string, string | number | boolean | null> = {},
  ) {
    this.db
      .prepare(
        "INSERT INTO admin_audit_events(id,admin_id,action,occurred_at,metadata_json) VALUES (?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        adminId,
        action,
        new Date().toISOString(),
        JSON.stringify(metadata),
      );
  }

  signInAdmin(emailValue: unknown, passwordValue: unknown): AdminSession {
    const email = this.normalizeEmail(emailValue);
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM admin_accounts WHERE email=?",
      )
      .get(email) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, passwordValue))
      throw new AccountError("invalid_credentials", 401);
    this.db
      .prepare("DELETE FROM admin_sessions WHERE expires_at<=?")
      .run(Date.now());
    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
    this.db
      .prepare(
        "INSERT INTO admin_sessions(token_hash,id,admin_id,expires_at,created_at) VALUES (?,?,?,?,?)",
      )
      .run(
        createHash("sha256").update(token).digest("base64url"),
        sessionId,
        account.id,
        expiresAt,
        new Date().toISOString(),
      );
    this.auditAdmin(account.id, "admin_signed_in");
    return {
      adminId: account.id,
      email: account.email,
      sessionId,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  authenticateAdmin(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const session = this.db
      .prepare(
        `SELECT s.id AS sessionId,s.admin_id AS adminId,s.expires_at AS expiresAt,a.email
         FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id
         WHERE s.token_hash=?`,
      )
      .get(tokenHash) as
      | { sessionId: string; adminId: string; expiresAt: number; email: string }
      | undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (session)
        this.db
          .prepare("DELETE FROM admin_sessions WHERE token_hash=?")
          .run(tokenHash);
      return undefined;
    }
    return {
      adminId: session.adminId,
      email: session.email,
      sessionId: session.sessionId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  adminOverview(adminId: string) {
    this.auditAdmin(adminId, "admin_overview_viewed");
    const count = (sql: string) =>
      (this.db.prepare(sql).get() as { count: number }).count;
    this.db
      .prepare("DELETE FROM admin_sessions WHERE expires_at<=?")
      .run(Date.now());
    return {
      accounts: {
        total: count("SELECT COUNT(*) AS count FROM accounts"),
        emailVerified: count(
          "SELECT COUNT(*) AS count FROM accounts WHERE email_verified_at IS NOT NULL",
        ),
        activeSessions: count(
          "SELECT COUNT(*) AS count FROM account_sessions WHERE expires_at > unixepoch('now') * 1000",
        ),
      },
      operations: {
        pendingAccountActions: this.pendingDeliveryCount(),
        pendingSecurityNotifications: this.pendingSecurityNotificationCount(),
      },
    };
  }

  adminAuditEvents(adminId: string) {
    return this.db
      .prepare(
        "SELECT action,occurred_at AS occurredAt FROM admin_audit_events WHERE admin_id=? ORDER BY occurred_at DESC LIMIT 50",
      )
      .all(adminId) as Array<{ action: string; occurredAt: string }>;
  }

  revokeAdmin(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const session = this.authenticateAdmin(token);
    if (session) this.auditAdmin(session.adminId, "admin_signed_out");
    return Boolean(
      this.db
        .prepare("DELETE FROM admin_sessions WHERE token_hash=?")
        .run(tokenHash).changes,
    );
  }

  deliveryStatus(accountId: string) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS pendingCount,MIN(created_at) AS oldestCreatedAt,
                MAX(attempt_count) AS retryAttempts,MAX(last_attempt_at) AS lastAttemptAt
         FROM account_delivery_events
         WHERE first_account_id=? OR second_account_id=?`,
      )
      .get(accountId, accountId) as {
      pendingCount: number;
      oldestCreatedAt: string | null;
      retryAttempts: number | null;
      lastAttemptAt: string | null;
    };
    return {
      state: row.pendingCount ? ("retrying" as const) : ("clear" as const),
      pendingCount: row.pendingCount,
      oldestCreatedAt: row.oldestCreatedAt,
      retryAttempts: row.retryAttempts ?? 0,
      lastAttemptAt: row.lastAttemptAt,
      automaticDiscard: false as const,
    };
  }

  enqueueSecurityNotification(
    accountId: string,
    event: SecurityNotificationEvent,
    occurredAt: string,
    recipientOverride?: string[],
  ) {
    const recipients = recipientOverride ?? this.notificationEmails(accountId);
    if (!recipients.length) return null;
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO account_security_notification_outbox(
          id,account_id,event,occurred_at,recipients_json,created_at
        ) VALUES (?,?,?,?,?,?)`,
      )
      .run(
        id,
        accountId,
        event,
        occurredAt,
        JSON.stringify(recipients),
        new Date().toISOString(),
      );
    return id;
  }

  private securityNotificationJobs(accountId: string) {
    return (
      this.db
        .prepare(
          `SELECT id,event,occurred_at AS occurredAt,recipients_json AS recipientsJson,
                  delivered_json AS deliveredJson
           FROM account_security_notification_outbox
           WHERE account_id=? ORDER BY created_at`,
        )
        .all(accountId) as Array<{
        id: string;
        event: SecurityNotificationEvent;
        occurredAt: string;
        recipientsJson: string;
        deliveredJson: string;
      }>
    ).map((row) => {
      const delivered = new Set(JSON.parse(row.deliveredJson) as string[]);
      return {
        id: row.id,
        event: row.event,
        occurredAt: row.occurredAt,
        recipients: JSON.parse(row.recipientsJson) as string[],
        delivered,
      };
    });
  }

  claimSecurityNotificationJobs(accountId: string, force = false) {
    const now = Date.now();
    const claimed = [];
    for (const job of this.securityNotificationJobs(accountId)) {
      const result = this.db
        .prepare(
          `UPDATE account_security_notification_outbox SET lease_until=?
           WHERE id=? AND account_id=? AND lease_until<=?
             AND (?=1 OR next_attempt_at<=?)`,
        )
        .run(
          now + SECURITY_NOTICE_LEASE_MS,
          job.id,
          accountId,
          now,
          force ? 1 : 0,
          now,
        );
      if (result.changes) claimed.push(job);
    }
    return claimed;
  }

  pendingSecurityNotificationAccountIds(now = Date.now()) {
    return (
      this.db
        .prepare(
          `SELECT DISTINCT account_id AS accountId
           FROM account_security_notification_outbox
           WHERE next_attempt_at<=? AND lease_until<=?`,
        )
        .all(now, now) as Array<{ accountId: string }>
    ).map(({ accountId }) => accountId);
  }

  recordSecurityNotificationAttempt(
    accountId: string,
    jobId: string,
    deliveredEmails: string[],
  ) {
    const job = this.securityNotificationJobs(accountId).find(
      ({ id }) => id === jobId,
    );
    if (!job) return;
    for (const email of deliveredEmails) job.delivered.add(email);
    if (job.recipients.every((email) => job.delivered.has(email))) {
      this.db
        .prepare(
          "DELETE FROM account_security_notification_outbox WHERE id=? AND account_id=?",
        )
        .run(jobId, accountId);
      return;
    }
    const attempt = this.db
      .prepare(
        "SELECT attempt_count AS attemptCount FROM account_security_notification_outbox WHERE id=? AND account_id=?",
      )
      .get(jobId, accountId) as { attemptCount: number } | undefined;
    const retryDelay = Math.min(
      SECURITY_NOTICE_RETRY_BASE_MS * 2 ** (attempt?.attemptCount ?? 0),
      SECURITY_NOTICE_RETRY_MAX_MS,
    );
    this.db
      .prepare(
        `UPDATE account_security_notification_outbox
         SET delivered_json=?,attempt_count=attempt_count+1,last_attempt_at=?,
             next_attempt_at=?,lease_until=0
         WHERE id=? AND account_id=?`,
      )
      .run(
        JSON.stringify([...job.delivered]),
        new Date().toISOString(),
        Date.now() + retryDelay,
        jobId,
        accountId,
      );
  }

  securityNotificationStatus(accountId: string) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS pendingCount,MIN(created_at) AS oldestCreatedAt,
                MAX(attempt_count) AS retryAttempts,MAX(last_attempt_at) AS lastAttemptAt
         FROM account_security_notification_outbox WHERE account_id=?`,
      )
      .get(accountId) as {
      pendingCount: number;
      oldestCreatedAt: string | null;
      retryAttempts: number | null;
      lastAttemptAt: string | null;
    };
    return {
      state: row.pendingCount ? ("retrying" as const) : ("clear" as const),
      pendingCount: row.pendingCount,
      oldestCreatedAt: row.oldestCreatedAt,
      retryAttempts: row.retryAttempts ?? 0,
      lastAttemptAt: row.lastAttemptAt,
      automaticDiscard: false as const,
    };
  }

  deliverPairEvent(
    firstAccountId: string,
    firstAction: AccountDeliveryAction,
    secondAccountId?: string,
    secondAction?: AccountDeliveryAction,
    eventId?: string,
  ) {
    return this.enqueueDelivery(
      firstAccountId,
      firstAction,
      secondAccountId,
      secondAction,
      eventId,
    );
  }

  private normalizeEmail(value: unknown) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (email.length > 254 || !EMAIL_PATTERN.test(email))
      throw new AccountError("invalid_email", 400);
    return email;
  }

  private validatePassword(value: unknown) {
    const password = typeof value === "string" ? value.normalize("NFC") : "";
    if (
      Array.from(password).length < PASSWORD_MINIMUM ||
      Array.from(password).length > 128
    )
      throw new AccountError("invalid_password", 400);
    if (COMMON_PASSWORDS.has(password.toLocaleLowerCase()))
      throw new AccountError("common_password", 400);
    return password;
  }

  private passwordHash(password: string, salt: Buffer) {
    return scryptSync(password, salt, 64, SCRYPT_OPTIONS);
  }

  private recoveryCodeHash(value: unknown) {
    const compact =
      typeof value === "string"
        ? value.trim().toLocaleLowerCase().replaceAll("-", "")
        : "";
    if (!/^[0-9a-f]{32}$/.test(compact)) return null;
    return createHash("sha256").update(compact).digest("base64url");
  }

  private passwordMatches(account: AccountRow | undefined, value: unknown) {
    const raw = typeof value === "string" && value.length <= 128 ? value : "";
    const salt = account
      ? Buffer.from(account.password_salt, "base64url")
      : Buffer.alloc(16);
    const expected = account
      ? Buffer.from(account.password_hash, "base64url")
      : Buffer.alloc(64);
    const normalized = raw.normalize("NFC");
    const normalizedMatch = timingSafeEqual(
      this.passwordHash(normalized, salt),
      expected,
    );
    const legacyMatch =
      raw !== normalized &&
      timingSafeEqual(this.passwordHash(raw, salt), expected);
    return Boolean(account) && (normalizedMatch || legacyMatch);
  }

  private store(accountId: string) {
    let store = this.stores.get(accountId);
    if (!store) {
      store = new Store(
        this.dataDirectory
          ? join(this.dataDirectory, `${accountId}.sqlite`)
          : ":memory:",
        { accountProfile: true },
      );
      this.stores.set(accountId, store);
    }
    return store;
  }

  hasAccount(accountId: string) {
    return Boolean(
      this.db.prepare("SELECT 1 FROM accounts WHERE id=?").get(accountId),
    );
  }

  accountStore(accountId: string) {
    return this.hasAccount(accountId) ? this.store(accountId) : undefined;
  }

  private sameRegion(left: string, right: string) {
    const normalize = (value: string) =>
      value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    return normalize(left) === normalize(right);
  }

  candidate(accountId: string): Candidate | undefined {
    const store = this.accountStore(accountId);
    if (
      !store ||
      !store.onboardingComplete() ||
      !store.consentReceipt() ||
      !store.discoveryConfigured() ||
      !directoryParticipationIsActive(store.directoryConsentReceipt())
    )
      return undefined;
    return {
      profile: { ...store.profile(), id: accountId, distanceKm: 0 },
      preferences: store.preferences(),
      explanationSharing: "private",
    };
  }

  candidatesFor(accountId: string): Candidate[] {
    const viewer = this.accountStore(accountId);
    if (
      !viewer ||
      viewer.accountStatus() !== "active" ||
      !this.candidate(accountId)
    )
      return [];
    const accountIds = this.db
      .prepare("SELECT id FROM accounts WHERE id<>? ORDER BY created_at,id")
      .all(accountId) as Array<{ id: string }>;
    return accountIds.flatMap(({ id }) => {
      const candidateStore = this.accountStore(id);
      const candidate = this.candidate(id);
      if (
        !candidateStore ||
        !candidate ||
        candidateStore.accountStatus() !== "active" ||
        candidateStore.hiddenIds().has(accountId) ||
        !this.sameRegion(viewer.profile().city, candidate.profile.city)
      )
        return [];
      return [candidate];
    });
  }

  publicProfile(accountId: string): PublicProfile | undefined {
    const store = this.accountStore(accountId);
    if (!store || !store.onboardingComplete() || !store.consentReceipt())
      return undefined;
    const { distanceKm: _distanceKm, ...profile } = store.profile();
    return {
      ...profile,
      id: accountId,
      distanceBand: "Same approximate region",
    };
  }

  private eraseAccount(accountId: string) {
    const account = this.db
      .prepare("SELECT id FROM accounts WHERE id=?")
      .get(accountId) as { id: string } | undefined;
    if (!account) return false;
    const peerAccountIds = this.db
      .prepare("SELECT id FROM accounts WHERE id<>? ORDER BY id")
      .all(accountId) as Array<{ id: string }>;
    for (const { id } of peerAccountIds)
      this.store(id).eraseDeletedAccount(accountId);
    const store = this.store(accountId);
    store.reset();
    store.close();
    this.stores.delete(accountId);
    this.db
      .prepare(
        "DELETE FROM account_delivery_events WHERE first_account_id=? OR second_account_id=?",
      )
      .run(accountId, accountId);
    const deleted =
      this.db.prepare("DELETE FROM accounts WHERE id=?").run(accountId)
        .changes > 0;
    if (!deleted) return false;
    if (this.dataDirectory) {
      const path = join(this.dataDirectory, `${accountId}.sqlite`);
      for (const candidate of [path, `${path}-wal`, `${path}-shm`])
        if (existsSync(candidate)) unlinkSync(candidate);
    }
    return true;
  }

  deleteAccount(accountId: string, currentPasswordValue: unknown) {
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE id=?",
      )
      .get(accountId) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, currentPasswordValue))
      throw new AccountError("invalid_current_password", 400);
    return this.eraseAccount(accountId);
  }

  deleteExternalAccount(accountId: string) {
    return this.eraseAccount(accountId);
  }

  private sessionClient(value: unknown): SessionClient {
    return ["web", "ios", "android"].includes(String(value))
      ? (value as SessionClient)
      : "unknown";
  }

  private issueSession(
    accountId: string,
    clientValue: unknown,
  ): AccountSession {
    this.db
      .prepare("DELETE FROM account_sessions WHERE expires_at<=?")
      .run(Date.now());
    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const expiresAt = Date.now() + this.sessionTtlMs;
    this.db
      .prepare(
        "INSERT INTO account_sessions(token_hash,id,account_id,client,expires_at,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        createHash("sha256").update(token).digest("base64url"),
        sessionId,
        accountId,
        this.sessionClient(clientValue),
        expiresAt,
        new Date().toISOString(),
      );
    return {
      accountId,
      sessionId,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      store: this.store(accountId),
    };
  }

  register(emailValue: unknown, passwordValue: unknown, client?: unknown) {
    const email = this.normalizeEmail(emailValue);
    const password = this.validatePassword(passwordValue);
    const id = randomUUID();
    const salt = randomBytes(16);
    try {
      this.db
        .prepare(
          "INSERT INTO accounts(id,email,password_hash,password_salt,created_at,email_verified_at) VALUES (?,?,?,?,?,NULL)",
        )
        .run(
          id,
          email,
          this.passwordHash(password, salt).toString("base64url"),
          salt.toString("base64url"),
          new Date().toISOString(),
        );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed"))
        throw new AccountError("account_exists", 409);
      throw error;
    }
    return this.issueSession(id, client);
  }

  provisionExternalSession(input: {
    accountId: string;
    email: string;
    verifiedAt: string | null;
    token: string;
    expiresAt: string;
    client: unknown;
    replaceSessions?: boolean;
  }) {
    const email = this.normalizeEmail(input.email);
    const expiry = Date.parse(input.expiresAt);
    if (!input.accountId || !input.token || !Number.isFinite(expiry))
      throw new AccountError("invalid_identity_response", 502);
    const existingByEmail = this.db
      .prepare("SELECT id FROM accounts WHERE email=?")
      .get(email) as { id: string } | undefined;
    if (existingByEmail && existingByEmail.id !== input.accountId)
      throw new AccountError("account_migration_conflict", 409);
    const createdAt = new Date().toISOString();
    const sessionId = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO accounts(
            id,email,password_hash,password_salt,created_at,email_verified_at
          ) VALUES (?,?,?,?,?,?)`,
        )
        .run(
          input.accountId,
          email,
          "external-identity",
          "external-identity",
          createdAt,
          input.verifiedAt,
        );
      this.db
        .prepare("UPDATE accounts SET email=?,email_verified_at=? WHERE id=?")
        .run(email, input.verifiedAt, input.accountId);
      if (input.replaceSessions)
        this.db
          .prepare("DELETE FROM account_sessions WHERE account_id=?")
          .run(input.accountId);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO account_sessions(
            token_hash,id,account_id,client,expires_at,created_at
          ) VALUES (?,?,?,?,?,?)`,
        )
        .run(
          createHash("sha256").update(input.token).digest("base64url"),
          sessionId,
          input.accountId,
          this.sessionClient(input.client),
          expiry,
          createdAt,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      accountId: input.accountId,
      sessionId,
      token: input.token,
      expiresAt: new Date(expiry).toISOString(),
      store: this.store(input.accountId),
    };
  }

  syncExternalIdentity(
    accountId: string,
    email: string,
    verifiedAt: string | null,
  ) {
    const normalized = this.normalizeEmail(email);
    const changed = this.db
      .prepare("UPDATE accounts SET email=?,email_verified_at=? WHERE id=?")
      .run(normalized, verifiedAt, accountId).changes;
    return changed > 0;
  }

  emailStatus(accountId: string) {
    const account = this.db
      .prepare(
        "SELECT email,email_verified_at AS verifiedAt FROM accounts WHERE id=?",
      )
      .get(accountId) as
      { email: string; verifiedAt: string | null } | undefined;
    if (!account) throw new AccountError("account_not_found", 404);
    return { email: account.email, verifiedAt: account.verifiedAt };
  }

  notificationAddressStatus(accountId: string) {
    const primary = this.emailStatus(accountId);
    const verified = this.db
      .prepare(
        "SELECT email,verified_at AS verifiedAt FROM account_notification_addresses WHERE account_id=?",
      )
      .get(accountId) as { email: string; verifiedAt: string } | undefined;
    const pending = this.db
      .prepare(
        "SELECT email FROM account_notification_verifications WHERE account_id=?",
      )
      .get(accountId) as { email: string } | undefined;
    return {
      primaryEmail: primary.email,
      primaryVerifiedAt: primary.verifiedAt,
      email: verified?.email ?? null,
      verifiedAt: verified?.verifiedAt ?? null,
      pendingEmail: pending?.email ?? null,
    };
  }

  notificationEmails(accountId: string) {
    const status = this.notificationAddressStatus(accountId);
    return [
      ...(status.primaryVerifiedAt ? [status.primaryEmail] : []),
      ...(status.email ? [status.email] : []),
    ];
  }

  createNotificationAddressVerification(
    accountId: string,
    currentPasswordValue: unknown,
    emailValue: unknown,
  ) {
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE id=?",
      )
      .get(accountId) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, currentPasswordValue))
      throw new AccountError("invalid_current_password", 400);
    const primary = this.emailStatus(accountId);
    if (!primary.verifiedAt)
      throw new AccountError("primary_email_unverified", 409);
    const email = this.normalizeEmail(emailValue);
    const status = this.notificationAddressStatus(accountId);
    if (email === primary.email || email === status.email)
      throw new AccountError("notification_email_unchanged", 409);
    const existing = this.db
      .prepare(
        "SELECT email,sent_at AS sentAt,failed_attempts AS failedAttempts FROM account_notification_verifications WHERE account_id=?",
      )
      .get(accountId) as
      { email: string; sentAt: number; failedAttempts: number } | undefined;
    const now = Date.now();
    if (existing?.email === email && now - existing.sentAt < 60_000)
      throw new AccountError("verification_resend_too_soon", 429);
    if (existing?.email === email && existing.failedAttempts >= 5)
      throw new AccountError("verification_attempts_exceeded", 429);
    const code = String(randomInt(10_000_000, 100_000_000));
    const salt = randomBytes(16);
    const expiresAt = now + 24 * 60 * 60 * 1000;
    this.db
      .prepare(
        `INSERT INTO account_notification_verifications(account_id,email,code_hash,code_salt,expires_at,failed_attempts,sent_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(account_id) DO UPDATE SET
           email=excluded.email,
           code_hash=excluded.code_hash,
           code_salt=excluded.code_salt,
           expires_at=excluded.expires_at,
           failed_attempts=excluded.failed_attempts,
           sent_at=excluded.sent_at`,
      )
      .run(
        accountId,
        email,
        this.passwordHash(code, salt).toString("base64url"),
        salt.toString("base64url"),
        expiresAt,
        existing?.email === email ? existing.failedAttempts : 0,
        now,
      );
    return { email, code, expiresAt: new Date(expiresAt).toISOString() };
  }

  cancelNotificationAddressVerification(accountId: string) {
    this.db
      .prepare(
        "DELETE FROM account_notification_verifications WHERE account_id=?",
      )
      .run(accountId);
  }

  confirmNotificationAddress(accountId: string, codeValue: unknown) {
    const code = typeof codeValue === "string" ? codeValue.trim() : "";
    const record = this.db
      .prepare(
        "SELECT email,code_hash AS codeHash,code_salt AS codeSalt,expires_at AS expiresAt,failed_attempts AS failedAttempts FROM account_notification_verifications WHERE account_id=?",
      )
      .get(accountId) as
      | {
          email: string;
          codeHash: string;
          codeSalt: string;
          expiresAt: number;
          failedAttempts: number;
        }
      | undefined;
    const salt = record
      ? Buffer.from(record.codeSalt, "base64url")
      : Buffer.alloc(16);
    const expected = record
      ? Buffer.from(record.codeHash, "base64url")
      : Buffer.alloc(64);
    const validFormat = /^\d{8}$/.test(code);
    const matches = timingSafeEqual(
      this.passwordHash(validFormat ? code : "", salt),
      expected,
    );
    if (record && record.failedAttempts >= 5)
      throw new AccountError("verification_attempts_exceeded", 429);
    if (!record || record.expiresAt <= Date.now() || !validFormat || !matches) {
      if (record)
        this.db
          .prepare(
            "UPDATE account_notification_verifications SET failed_attempts=failed_attempts+1 WHERE account_id=?",
          )
          .run(accountId);
      throw new AccountError("invalid_verification_code", 400);
    }
    const verifiedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO account_notification_addresses(account_id,email,verified_at)
           VALUES (?,?,?)
           ON CONFLICT(account_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at`,
        )
        .run(accountId, record.email, verifiedAt);
      this.db
        .prepare(
          "DELETE FROM account_notification_verifications WHERE account_id=?",
        )
        .run(accountId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { email: record.email, verifiedAt };
  }

  removeNotificationAddress(accountId: string, currentPasswordValue: unknown) {
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE id=?",
      )
      .get(accountId) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, currentPasswordValue))
      throw new AccountError("invalid_current_password", 400);
    let removed = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      removed = Number(
        this.db
          .prepare(
            "DELETE FROM account_notification_addresses WHERE account_id=?",
          )
          .run(accountId).changes,
      );
      removed += Number(
        this.db
          .prepare(
            "DELETE FROM account_notification_verifications WHERE account_id=?",
          )
          .run(accountId).changes,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (!removed) throw new AccountError("notification_email_not_found", 404);
  }

  createEmailVerification(accountId: string) {
    const status = this.emailStatus(accountId);
    if (status.verifiedAt)
      throw new AccountError("email_already_verified", 409);
    const existing = this.db
      .prepare(
        "SELECT sent_at AS sentAt,failed_attempts AS failedAttempts FROM account_email_verifications WHERE account_id=?",
      )
      .get(accountId) as { sentAt: number; failedAttempts: number } | undefined;
    const now = Date.now();
    if (existing && now - existing.sentAt < 60_000)
      throw new AccountError("verification_resend_too_soon", 429);
    if (existing && existing.failedAttempts >= 5)
      throw new AccountError("verification_attempts_exceeded", 429);
    const code = String(randomInt(10_000_000, 100_000_000));
    const salt = randomBytes(16);
    const expiresAt = now + 24 * 60 * 60 * 1000;
    this.db
      .prepare(
        `INSERT INTO account_email_verifications(account_id,code_hash,code_salt,expires_at,failed_attempts,sent_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(account_id) DO UPDATE SET
           code_hash=excluded.code_hash,
           code_salt=excluded.code_salt,
           expires_at=excluded.expires_at,
           sent_at=excluded.sent_at`,
      )
      .run(
        accountId,
        this.passwordHash(code, salt).toString("base64url"),
        salt.toString("base64url"),
        expiresAt,
        existing?.failedAttempts ?? 0,
        now,
      );
    return {
      email: status.email,
      code,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  cancelEmailVerification(accountId: string) {
    this.db
      .prepare("DELETE FROM account_email_verifications WHERE account_id=?")
      .run(accountId);
  }

  confirmEmail(accountId: string, codeValue: unknown) {
    const code = typeof codeValue === "string" ? codeValue.trim() : "";
    const record = this.db
      .prepare(
        "SELECT code_hash AS codeHash,code_salt AS codeSalt,expires_at AS expiresAt,failed_attempts AS failedAttempts FROM account_email_verifications WHERE account_id=?",
      )
      .get(accountId) as
      | {
          codeHash: string;
          codeSalt: string;
          expiresAt: number;
          failedAttempts: number;
        }
      | undefined;
    const salt = record
      ? Buffer.from(record.codeSalt, "base64url")
      : Buffer.alloc(16);
    const expected = record
      ? Buffer.from(record.codeHash, "base64url")
      : Buffer.alloc(64);
    const validFormat = /^\d{8}$/.test(code);
    const matches = timingSafeEqual(
      this.passwordHash(validFormat ? code : "", salt),
      expected,
    );
    if (record && record.failedAttempts >= 5)
      throw new AccountError("verification_attempts_exceeded", 429);
    if (!record || record.expiresAt <= Date.now() || !validFormat || !matches) {
      if (record)
        this.db
          .prepare(
            "UPDATE account_email_verifications SET failed_attempts=failed_attempts+1 WHERE account_id=?",
          )
          .run(accountId);
      throw new AccountError("invalid_verification_code", 400);
    }
    const verifiedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE accounts SET email_verified_at=? WHERE id=?")
        .run(verifiedAt, accountId);
      this.db
        .prepare("DELETE FROM account_email_verifications WHERE account_id=?")
        .run(accountId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { email: this.emailStatus(accountId).email, verifiedAt };
  }

  emailChangeStatus(accountId: string) {
    const pending = this.db
      .prepare(
        "SELECT email,expires_at AS expiresAt FROM account_email_change_requests WHERE account_id=?",
      )
      .get(accountId) as { email: string; expiresAt: number } | undefined;
    return {
      ...this.emailStatus(accountId),
      pendingEmail: pending?.email ?? null,
      pendingExpiresAt: pending
        ? new Date(pending.expiresAt).toISOString()
        : null,
    };
  }

  createEmailChange(
    accountId: string,
    currentPasswordValue: unknown,
    emailValue: unknown,
  ) {
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE id=?",
      )
      .get(accountId) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, currentPasswordValue))
      throw new AccountError("invalid_current_password", 400);
    const status = this.emailStatus(accountId);
    if (!status.verifiedAt)
      throw new AccountError("primary_email_unverified", 409);
    const email = this.normalizeEmail(emailValue);
    if (email === status.email)
      throw new AccountError("primary_email_unchanged", 409);
    const existingAccount = this.db
      .prepare("SELECT 1 FROM accounts WHERE email=?")
      .get(email);
    if (existingAccount)
      throw new AccountError("email_change_unavailable", 409);
    const existing = this.db
      .prepare(
        "SELECT email,sent_at AS sentAt,failed_attempts AS failedAttempts FROM account_email_change_requests WHERE account_id=?",
      )
      .get(accountId) as
      { email: string; sentAt: number; failedAttempts: number } | undefined;
    const now = Date.now();
    if (existing?.email === email && now - existing.sentAt < 60_000)
      throw new AccountError("verification_resend_too_soon", 429);
    if (existing?.email === email && existing.failedAttempts >= 5)
      throw new AccountError("verification_attempts_exceeded", 429);
    const currentCode = String(randomInt(10_000_000, 100_000_000));
    const newCode = String(randomInt(10_000_000, 100_000_000));
    const currentSalt = randomBytes(16);
    const newSalt = randomBytes(16);
    const expiresAt = now + 24 * 60 * 60 * 1000;
    try {
      this.db
        .prepare(
          `INSERT INTO account_email_change_requests(
             account_id,email,current_code_hash,current_code_salt,new_code_hash,new_code_salt,
             expires_at,failed_attempts,sent_at
           ) VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(account_id) DO UPDATE SET
             email=excluded.email,current_code_hash=excluded.current_code_hash,
             current_code_salt=excluded.current_code_salt,new_code_hash=excluded.new_code_hash,
             new_code_salt=excluded.new_code_salt,expires_at=excluded.expires_at,
             failed_attempts=excluded.failed_attempts,sent_at=excluded.sent_at`,
        )
        .run(
          accountId,
          email,
          this.passwordHash(currentCode, currentSalt).toString("base64url"),
          currentSalt.toString("base64url"),
          this.passwordHash(newCode, newSalt).toString("base64url"),
          newSalt.toString("base64url"),
          expiresAt,
          existing?.email === email ? existing.failedAttempts : 0,
          now,
        );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed"))
        throw new AccountError("email_change_unavailable", 409);
      throw error;
    }
    const expiration = new Date(expiresAt).toISOString();
    return {
      current: {
        email: status.email,
        code: currentCode,
        expiresAt: expiration,
        purpose: "email_change_current" as const,
      },
      proposed: {
        email,
        code: newCode,
        expiresAt: expiration,
        purpose: "email_change_new" as const,
      },
    };
  }

  cancelEmailChange(accountId: string) {
    return Boolean(
      this.db
        .prepare("DELETE FROM account_email_change_requests WHERE account_id=?")
        .run(accountId).changes,
    );
  }

  confirmEmailChange(
    accountId: string,
    currentSessionId: string,
    currentCodeValue: unknown,
    newCodeValue: unknown,
  ) {
    const currentCode =
      typeof currentCodeValue === "string" ? currentCodeValue.trim() : "";
    const newCode = typeof newCodeValue === "string" ? newCodeValue.trim() : "";
    const record = this.db
      .prepare(
        `SELECT email,current_code_hash AS currentCodeHash,current_code_salt AS currentCodeSalt,
                new_code_hash AS newCodeHash,new_code_salt AS newCodeSalt,
                expires_at AS expiresAt,failed_attempts AS failedAttempts
         FROM account_email_change_requests WHERE account_id=?`,
      )
      .get(accountId) as
      | {
          email: string;
          currentCodeHash: string;
          currentCodeSalt: string;
          newCodeHash: string;
          newCodeSalt: string;
          expiresAt: number;
          failedAttempts: number;
        }
      | undefined;
    const validFormat = /^\d{8}$/;
    const matches = (value: string, hash?: string, salt?: string) =>
      timingSafeEqual(
        this.passwordHash(
          validFormat.test(value) ? value : "",
          salt ? Buffer.from(salt, "base64url") : Buffer.alloc(16),
        ),
        hash ? Buffer.from(hash, "base64url") : Buffer.alloc(64),
      );
    if (record && record.failedAttempts >= 5)
      throw new AccountError("verification_attempts_exceeded", 429);
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      !matches(currentCode, record.currentCodeHash, record.currentCodeSalt) ||
      !matches(newCode, record.newCodeHash, record.newCodeSalt)
    ) {
      if (record)
        this.db
          .prepare(
            "UPDATE account_email_change_requests SET failed_attempts=failed_attempts+1 WHERE account_id=?",
          )
          .run(accountId);
      throw new AccountError("invalid_verification_code", 400);
    }
    const previousRecipients = this.notificationEmails(accountId);
    const verifiedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE accounts SET email=?,email_verified_at=? WHERE id=?")
        .run(record.email, verifiedAt, accountId);
      this.db
        .prepare("DELETE FROM account_email_change_requests WHERE account_id=?")
        .run(accountId);
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=? AND id<>?")
        .run(accountId, currentSessionId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error).includes("UNIQUE constraint failed"))
        throw new AccountError("email_change_unavailable", 409);
      throw error;
    }
    const notificationId = this.enqueueSecurityNotification(
      accountId,
      "primary_email_changed",
      verifiedAt,
      [...new Set([...previousRecipients, record.email])],
    );
    return {
      email: record.email,
      verifiedAt,
      otherSessionsRevoked: true as const,
      notificationId,
    };
  }

  signIn(emailValue: unknown, passwordValue: unknown, client?: unknown) {
    const email = this.normalizeEmail(emailValue);
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE email=?",
      )
      .get(email) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, passwordValue))
      throw new AccountError("invalid_credentials", 401);
    return this.issueSession(account.id, client);
  }

  changePassword(
    accountId: string,
    currentSessionId: string,
    currentPasswordValue: unknown,
    newPasswordValue: unknown,
  ) {
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE id=?",
      )
      .get(accountId) as AccountRow | undefined;
    if (!account) throw new AccountError("invalid_current_password", 400);
    const expected = Buffer.from(account.password_hash, "base64url");
    if (!this.passwordMatches(account, currentPasswordValue))
      throw new AccountError("invalid_current_password", 400);
    const newPassword = this.validatePassword(newPasswordValue);
    if (
      timingSafeEqual(
        this.passwordHash(
          newPassword,
          Buffer.from(account.password_salt, "base64url"),
        ),
        expected,
      )
    )
      throw new AccountError("password_unchanged", 400);
    const session = this.db
      .prepare(
        "SELECT client FROM account_sessions WHERE account_id=? AND id=?",
      )
      .get(accountId, currentSessionId) as
      { client: SessionClient } | undefined;
    if (!session) throw new AccountError("session_required", 401);
    const salt = randomBytes(16);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const sessionId = randomUUID();
    const expiresAt = Date.now() + this.sessionTtlMs;
    const createdAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE accounts SET password_hash=?,password_salt=? WHERE id=?",
        )
        .run(
          this.passwordHash(newPassword, salt).toString("base64url"),
          salt.toString("base64url"),
          accountId,
        );
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=?")
        .run(accountId);
      this.db
        .prepare(
          "INSERT INTO account_sessions(token_hash,id,account_id,client,expires_at,created_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          tokenHash,
          sessionId,
          accountId,
          session.client,
          expiresAt,
          createdAt,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      accountId,
      sessionId,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      store: this.store(accountId),
    };
  }

  generateRecoveryCodes(accountId: string, currentPasswordValue: unknown) {
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE id=?",
      )
      .get(accountId) as AccountRow | undefined;
    if (!account || !this.passwordMatches(account, currentPasswordValue))
      throw new AccountError("invalid_current_password", 400);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(16)
        .toString("hex")
        .match(/.{1,4}/g)!
        .join("-"),
    );
    const createdAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM account_recovery_codes WHERE account_id=?")
        .run(accountId);
      const insert = this.db.prepare(
        "INSERT INTO account_recovery_codes(code_hash,account_id,created_at) VALUES (?,?,?)",
      );
      for (const code of codes)
        insert.run(this.recoveryCodeHash(code), accountId, createdAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { codes, createdAt };
  }

  recoverAccount(
    emailValue: unknown,
    recoveryCodeValue: unknown,
    newPasswordValue: unknown,
    clientValue?: unknown,
  ) {
    const email = this.normalizeEmail(emailValue);
    const codeHash =
      this.recoveryCodeHash(recoveryCodeValue) ??
      createHash("sha256").update("invalid recovery code").digest("base64url");
    const account = this.db
      .prepare(
        `SELECT accounts.id,accounts.email,accounts.password_hash,accounts.password_salt,accounts.created_at
         FROM accounts JOIN account_recovery_codes
         ON account_recovery_codes.account_id=accounts.id
         WHERE accounts.email=? AND account_recovery_codes.code_hash=?`,
      )
      .get(email, codeHash) as AccountRow | undefined;
    if (!account) throw new AccountError("invalid_recovery", 400);
    const newPassword = this.validatePassword(newPasswordValue);
    if (this.passwordMatches(account, newPassword))
      throw new AccountError("password_unchanged", 400);
    const salt = randomBytes(16);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const sessionId = randomUUID();
    const expiresAt = Date.now() + this.sessionTtlMs;
    const createdAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE accounts SET password_hash=?,password_salt=? WHERE id=?",
        )
        .run(
          this.passwordHash(newPassword, salt).toString("base64url"),
          salt.toString("base64url"),
          account.id,
        );
      this.db
        .prepare("DELETE FROM account_recovery_codes WHERE account_id=?")
        .run(account.id);
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=?")
        .run(account.id);
      this.db
        .prepare(
          "INSERT INTO account_sessions(token_hash,id,account_id,client,expires_at,created_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          tokenHash,
          sessionId,
          account.id,
          this.sessionClient(clientValue),
          expiresAt,
          createdAt,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      accountId: account.id,
      sessionId,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      store: this.store(account.id),
    };
  }

  authenticate(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const session = this.db
      .prepare(
        "SELECT id AS sessionId,account_id AS accountId,expires_at AS expiresAt FROM account_sessions WHERE token_hash=?",
      )
      .get(tokenHash) as
      { sessionId: string; accountId: string; expiresAt: number } | undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (session)
        this.db
          .prepare("DELETE FROM account_sessions WHERE token_hash=?")
          .run(tokenHash);
      return undefined;
    }
    return {
      accountId: session.accountId,
      sessionId: session.sessionId,
      store: this.store(session.accountId),
    };
  }

  sessions(accountId: string, currentSessionId: string) {
    this.db
      .prepare("DELETE FROM account_sessions WHERE expires_at<=?")
      .run(Date.now());
    return (
      this.db
        .prepare(
          "SELECT id,client,created_at AS createdAt,expires_at AS expiresAt FROM account_sessions WHERE account_id=? ORDER BY created_at DESC",
        )
        .all(accountId) as Array<{
        id: string;
        client: SessionClient;
        createdAt: string;
        expiresAt: number;
      }>
    ).map((session): PublicAccountSession => ({
      ...session,
      expiresAt: new Date(session.expiresAt).toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  revokeSession(accountId: string, sessionId: string) {
    return (
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=? AND id=?")
        .run(accountId, sessionId).changes > 0
    );
  }

  revoke(token: string) {
    return (
      this.db
        .prepare("DELETE FROM account_sessions WHERE token_hash=?")
        .run(createHash("sha256").update(token).digest("base64url")).changes > 0
    );
  }

  close() {
    for (const store of this.stores.values()) store.close();
    this.stores.clear();
    this.db.close();
  }
}
