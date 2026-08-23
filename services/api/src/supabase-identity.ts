import {
  AccountError,
  type AccountSession,
  type SessionClient,
} from "./accounts.js";
import { createHmac } from "node:crypto";

type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
};

type AuthResponse = {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: AuthUser;
  code?: number | string;
  error_code?: string;
  msg?: string;
  error_description?: string;
};

export type PendingRegistration = {
  authentication: false;
  confirmationRequired: true;
  email: string;
};

const normalizedBaseUrl = (value: string) => value.replace(/\/+$/, "");

export class SupabaseIdentity {
  readonly url: string;

  constructor(
    url = process.env.OPENMATCH_SUPABASE_AUTH_URL ?? "",
    private readonly fetcher: typeof fetch = fetch,
    private readonly jwtSecret = process.env.OPENMATCH_SUPABASE_JWT_SECRET ??
      "",
  ) {
    if (!url) throw new Error("OPENMATCH_SUPABASE_AUTH_URL is required");
    const parsed = new URL(url);
    if (
      !/^https:$/.test(parsed.protocol) &&
      !this.isPrivateDevelopmentUrl(parsed)
    )
      throw new Error(
        "OPENMATCH_SUPABASE_AUTH_URL must use HTTPS outside private development addresses",
      );
    this.url = normalizedBaseUrl(parsed.toString());
  }

  private serviceToken() {
    if (!this.jwtSecret)
      throw new AccountError("identity_admin_not_configured", 503);
    const encoded = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({
      aud: "authenticated",
      exp: now + 300,
      iat: now,
      iss: "openmatch",
      role: "service_role",
    })}`;
    const signature = createHmac("sha256", this.jwtSecret)
      .update(unsigned)
      .digest("base64url");
    return `${unsigned}.${signature}`;
  }

  private isPrivateDevelopmentUrl(url: URL) {
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "auth" ||
        url.hostname.startsWith("100."))
    );
  }

  private async body(response: Response) {
    return (await response.json().catch(() => ({}))) as AuthResponse;
  }

  private client(value: unknown): SessionClient {
    return value === "web" || value === "ios" || value === "android"
      ? value
      : "unknown";
  }

  private authError(response: Response, body: AuthResponse) {
    const code = body.error_code ?? body.msg ?? body.error_description ?? "";
    if (
      response.status === 422 ||
      ["weak_password", "validation_failed"].includes(body.error_code ?? "")
    )
      return new AccountError("invalid_password", 400);
    if (
      ["user_already_exists", "email_exists"].includes(body.error_code ?? "") ||
      /already registered|already exists/i.test(code)
    )
      return new AccountError("account_exists", 409);
    if (
      ["invalid_credentials", "email_not_confirmed"].includes(
        body.error_code ?? "",
      )
    )
      return new AccountError(
        body.error_code === "email_not_confirmed"
          ? "email_not_confirmed"
          : "invalid_credentials",
        401,
      );
    return new AccountError("identity_service_unavailable", 503);
  }

  private session(
    body: AuthResponse,
    client: SessionClient,
  ): Omit<AccountSession, "sessionId" | "store"> & {
    email: string;
    verifiedAt: string | null;
    client: SessionClient;
  } {
    if (!body.user?.id || !body.user.email || !body.access_token)
      throw new AccountError("invalid_identity_response", 502);
    const expiry = body.expires_at
      ? body.expires_at * 1000
      : Date.now() + (body.expires_in ?? 3600) * 1000;
    return {
      accountId: body.user.id,
      token: body.access_token,
      expiresAt: new Date(expiry).toISOString(),
      email: body.user.email,
      verifiedAt: body.user.email_confirmed_at ?? null,
      client,
    };
  }

  async register(
    email: string,
    password: string,
    client: unknown,
  ): Promise<PendingRegistration | ReturnType<SupabaseIdentity["session"]>> {
    const response = await this.fetcher(`${this.url}/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    if (!response) throw new AccountError("identity_service_unavailable", 503);
    const body = await this.body(response);
    if (!response.ok) throw this.authError(response, body);
    if (!body.access_token)
      return { authentication: false, confirmationRequired: true, email };
    return this.session(body, this.client(client));
  }

  async signIn(email: string, password: string, client: unknown) {
    const response = await this.fetcher(
      `${this.url}/token?grant_type=password`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
    ).catch(() => null);
    if (!response) throw new AccountError("identity_service_unavailable", 503);
    const body = await this.body(response);
    if (!response.ok) throw this.authError(response, body);
    return this.session(body, this.client(client));
  }

  async changePassword(input: {
    accountId: string;
    email: string;
    currentPassword: unknown;
    newPassword: unknown;
    client: unknown;
  }) {
    if (typeof input.currentPassword !== "string")
      throw new AccountError("invalid_current_password", 400);
    if (typeof input.newPassword !== "string")
      throw new AccountError("invalid_password", 400);
    const current = await this.signIn(
      input.email,
      input.currentPassword,
      input.client,
    ).catch((error) => {
      if (error instanceof AccountError && error.code === "invalid_credentials")
        throw new AccountError("invalid_current_password", 400);
      throw error;
    });
    if (current.accountId !== input.accountId)
      throw new AccountError("invalid_current_password", 400);
    const response = await this.fetcher(`${this.url}/user`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${current.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: input.newPassword }),
    }).catch(() => null);
    if (!response) throw new AccountError("identity_service_unavailable", 503);
    const body = await this.body(response);
    if (!response.ok) throw this.authError(response, body);
    await this.signOut(current.token);
    return this.signIn(input.email, input.newPassword, input.client);
  }

  async verifyPassword(input: {
    accountId: string;
    email: string;
    password: unknown;
    client: unknown;
  }) {
    if (typeof input.password !== "string")
      throw new AccountError("invalid_current_password", 400);
    const session = await this.signIn(
      input.email,
      input.password,
      input.client,
    ).catch((error) => {
      if (error instanceof AccountError && error.code === "invalid_credentials")
        throw new AccountError("invalid_current_password", 400);
      throw error;
    });
    if (session.accountId !== input.accountId)
      throw new AccountError("invalid_current_password", 400);
    return session;
  }

  async deleteUser(input: {
    accountId: string;
    email: string;
    password: unknown;
    client: unknown;
  }) {
    const verified = await this.verifyPassword(input);
    const response = await this.fetcher(
      `${this.url}/admin/users/${encodeURIComponent(input.accountId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${this.serviceToken()}` },
      },
    ).catch(() => null);
    if (!response) throw new AccountError("identity_service_unavailable", 503);
    if (!response.ok) {
      const body = await this.body(response);
      throw this.authError(response, body);
    }
    await this.signOut(verified.token);
  }

  async authenticate(token: string) {
    const response = await this.fetcher(`${this.url}/user`, {
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (!response?.ok) return undefined;
    const user = (await response.json().catch(() => null)) as AuthUser | null;
    if (!user?.id || !user.email) return undefined;
    return {
      accountId: user.id,
      email: user.email,
      verifiedAt: user.email_confirmed_at ?? null,
    };
  }

  async signOut(token: string) {
    await this.fetcher(`${this.url}/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
  }
}
