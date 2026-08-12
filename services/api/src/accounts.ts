import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { Store } from "./store.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MINIMUM = 12;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
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
  token: string;
  expiresAt: string;
  store: Store;
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
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private normalizeEmail(value: unknown) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (email.length > 254 || !EMAIL_PATTERN.test(email))
      throw new AccountError("invalid_email", 400);
    return email;
  }

  private validatePassword(value: unknown) {
    if (
      typeof value !== "string" ||
      value.length < PASSWORD_MINIMUM ||
      value.length > 128
    )
      throw new AccountError("invalid_password", 400);
    return value;
  }

  private passwordHash(password: string, salt: Buffer) {
    return scryptSync(password, salt, 64, SCRYPT_OPTIONS);
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

  private issueSession(accountId: string): AccountSession {
    this.db
      .prepare("DELETE FROM account_sessions WHERE expires_at<=?")
      .run(Date.now());
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + this.sessionTtlMs;
    this.db
      .prepare(
        "INSERT INTO account_sessions(token_hash,account_id,expires_at,created_at) VALUES (?,?,?,?)",
      )
      .run(
        createHash("sha256").update(token).digest("base64url"),
        accountId,
        expiresAt,
        new Date().toISOString(),
      );
    return {
      accountId,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      store: this.store(accountId),
    };
  }

  register(emailValue: unknown, passwordValue: unknown) {
    const email = this.normalizeEmail(emailValue);
    const password = this.validatePassword(passwordValue);
    const id = randomUUID();
    const salt = randomBytes(16);
    try {
      this.db
        .prepare(
          "INSERT INTO accounts(id,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)",
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
    return this.issueSession(id);
  }

  signIn(emailValue: unknown, passwordValue: unknown) {
    const email = this.normalizeEmail(emailValue);
    const password =
      typeof passwordValue === "string" && passwordValue.length <= 128
        ? passwordValue
        : "";
    const account = this.db
      .prepare(
        "SELECT id,email,password_hash,password_salt,created_at FROM accounts WHERE email=?",
      )
      .get(email) as AccountRow | undefined;
    const salt = account
      ? Buffer.from(account.password_salt, "base64url")
      : Buffer.alloc(16);
    const expected = account
      ? Buffer.from(account.password_hash, "base64url")
      : Buffer.alloc(64);
    const actual = this.passwordHash(password, salt);
    if (!account || !timingSafeEqual(actual, expected))
      throw new AccountError("invalid_credentials", 401);
    return this.issueSession(account.id);
  }

  authenticate(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const session = this.db
      .prepare(
        "SELECT account_id AS accountId,expires_at AS expiresAt FROM account_sessions WHERE token_hash=?",
      )
      .get(tokenHash) as { accountId: string; expiresAt: number } | undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (session)
        this.db
          .prepare("DELETE FROM account_sessions WHERE token_hash=?")
          .run(tokenHash);
      return undefined;
    }
    return {
      accountId: session.accountId,
      store: this.store(session.accountId),
    };
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
