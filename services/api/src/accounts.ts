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
import { Store } from "./store.js";
import type { Candidate, PublicProfile } from "@openmatch/matching";

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
const RECOVERY_CODE_COUNT = 8;
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

  constructor(
    path = process.env.OPENMATCH_ACCOUNTS_DB ?? "./openmatch-accounts.sqlite",
    options: { dataDirectory?: string | null; sessionTtlMs?: number } = {},
  ) {
    this.db = new DatabaseSync(path);
    this.dataDirectory =
      options.dataDirectory === undefined
        ? path === ":memory:"
          ? null
          : join(dirname(path), "openmatch-account-data")
        : options.dataDirectory;
    this.sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    if (!Number.isInteger(this.sessionTtlMs) || this.sessionTtlMs < 60_000)
      throw new RangeError(
        "account session lifetime must be at least one minute",
      );
    if (this.dataDirectory) mkdirSync(this.dataDirectory, { recursive: true });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
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
    `);
    const accountColumns = this.db
      .prepare("PRAGMA table_info(accounts)")
      .all() as Array<{
      name: string;
    }>;
    if (!accountColumns.some(({ name }) => name === "email_verified_at"))
      this.db.exec("ALTER TABLE accounts ADD COLUMN email_verified_at TEXT");
    const sessionColumns = this.db
      .prepare("PRAGMA table_info(account_sessions)")
      .all() as Array<{ name: string }>;
    if (!sessionColumns.some(({ name }) => name === "id"))
      this.db.exec("ALTER TABLE account_sessions ADD COLUMN id TEXT");
    if (!sessionColumns.some(({ name }) => name === "client"))
      this.db.exec(
        "ALTER TABLE account_sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'unknown'",
      );
    const sessionsWithoutId = this.db
      .prepare(
        "SELECT token_hash AS tokenHash FROM account_sessions WHERE id IS NULL",
      )
      .all() as Array<{ tokenHash: string }>;
    const assignId = this.db.prepare(
      "UPDATE account_sessions SET id=? WHERE token_hash=?",
    );
    for (const session of sessionsWithoutId)
      assignId.run(randomUUID(), session.tokenHash);
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS account_sessions_id ON account_sessions(id)",
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
      store.directoryConsentReceipt()?.participating !== true
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
    if (!viewer) return [];
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

  deleteAccount(accountId: string) {
    const store = this.store(accountId);
    store.reset();
    store.close();
    this.stores.delete(accountId);
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
